// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Hono, type Context, type Next } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
  boardLocaleSchema,
  boardNameSchema,
  DEFAULT_PHASE_PLAN,
  EXPORT_FORMATS,
  EXPORT_SCOPES,
  layoutModeSchema,
  exportContentType,
  exportFileName,
  renderExport,
  templateColumnNames,
  templateKeySchema,
  type ExportFormat,
  type ExportScope,
} from "@retrobeam/shared";
import { boardStub, limiterStub } from "./board-stub.js";
import { searchGifs } from "./gifs.js";
import { generateSecret, isSecretShaped } from "./ids.js";

export { BoardRoom } from "./board-room.js";
export { RateLimiter } from "./rate-limiter.js";

const createBoardRequestSchema = z.object({
  name: boardNameSchema,
  template: templateKeySchema.default("went-well"),
  locale: boardLocaleSchema.default("en"),
  // The check-in warm-up is off by default; opt in here to run the full flow.
  checkin: z.boolean().default(false),
  // Board layout: classic columns (default) or the freeform canvas.
  layout: layoutModeSchema.default("columns"),
});

const duplicateBoardRequestSchema = z.object({
  // localized "Copy of …" from the client; falls back to the source name
  name: boardNameSchema.optional(),
  // The admin capability is a 128-bit hex secret; anything else cannot be one,
  // so it is refused before a DO is woken to compare it.
  adminToken: z.string().regex(/^[0-9a-f]{32}$/),
});

const app = new Hono<{ Bindings: Env }>();

// Board creation is unauthenticated and each call mints a permanent,
// alarm-armed Durable Object. The free-tier allowance is account-wide, so one
// unthrottled script takes every board offline until midnight UTC. Keyed on the
// client IP, which is all an anonymous product has.
//
// TWO layers, and only the second is a guarantee:
//
//  1. The platform binding, best effort. Its counters are per-machine and
//     reconciled in the background, so on a low-traffic Worker it admits
//     everything (measured: 50 requests in seconds, none refused). It costs
//     nothing and does shed load once traffic is high enough to be worth
//     shedding, so it runs first and saves a Durable Object request when it
//     fires — but nothing may depend on it.
//  2. The RateLimiter Durable Object, authoritative. One instance,
//     single-threaded, so its count is exact. Costs one DO request per attempt
//     — cheap next to the permanent object a create would otherwise mint.
const CREATE_BURST = 10;
const CREATE_PER_SEC = 10 / 60; // ten a minute sustained

function createLimit() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const key = c.req.header("cf-connecting-ip") ?? "unknown";
    const cheap = await c.env.CREATE_LIMITER.limit({ key });
    if (!cheap.success) {
      return c.json({ error: "RATE_LIMITED" }, 429, { "retry-after": "60" });
    }
    const decision = await limiterStub(c.env).take(
      `create:${key}`,
      CREATE_BURST,
      CREATE_PER_SEC,
    );
    if (!decision.allowed) {
      return c.json({ error: "RATE_LIMITED" }, 429, {
        "retry-after": String(decision.retryAfter),
      });
    }
    await next();
  };
}

// Both POST bodies are a handful of short fields; nothing legitimate is large.
const smallBody = bodyLimit({
  maxSize: 4 * 1024,
  onError: (c) => c.json({ error: "PAYLOAD_TOO_LARGE" }, 413),
});

app.post("/api/boards", smallBody, createLimit(), async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = createBoardRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "INVALID_REQUEST" }, 400);
  }
  const boardId = generateSecret();
  const adminToken = generateSecret();
  // Template columns are materialized in the creator's language at creation —
  // column names are board data, editable afterwards.
  const columns = templateColumnNames(
    parsed.data.template,
    parsed.data.locale,
  ).map((name, index) => ({ id: generateSecret(), name, order: index }));
  await boardStub(c.env, boardId).initialize({
    boardId,
    name: parsed.data.name,
    adminToken,
    columns,
    // Empty = the client shows a localized default set of agreements until the
    // facilitator edits them (avoids baking a locale into stored data).
    workingAgreements: "",
    layout: parsed.data.layout,
    // Only overrides the default when the caller opts into the check-in phase.
    ...(parsed.data.checkin
      ? { phasePlan: { ...DEFAULT_PHASE_PLAN, checkin: true } }
      : {}),
  });
  return c.json({ boardId, adminToken });
});

// Duplicate a board's STRUCTURE (columns, config, working agreements) into a
// fresh board — no notes, votes, participants, kudos, or roti carry over.
// Gated on the source board's admin token (facilitator-only).
app.post("/api/boards/:id/duplicate", smallBody, createLimit(), async (c) => {
  const sourceId = c.req.param("id");
  if (!isSecretShaped(sourceId)) {
    return c.json({ error: "BOARD_NOT_FOUND" }, 404);
  }
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = duplicateBoardRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "INVALID_REQUEST" }, 400);
  }
  const snapshot = await boardStub(c.env, sourceId).duplicationSnapshot(
    parsed.data.adminToken,
  );
  // null = board missing OR wrong admin token — 404 either way (the id is the
  // capability; we don't confirm existence to a non-facilitator).
  if (snapshot === null) {
    return c.json({ error: "BOARD_NOT_FOUND" }, 404);
  }
  const boardId = generateSecret();
  const adminToken = generateSecret();
  // Fresh column ids — the source ids never cross into the copy. Staged
  // (hidden) columns stay staged so their names are not exposed to the copy.
  const columns = snapshot.columns.map((column, index) => ({
    id: generateSecret(),
    name: column.name,
    order: index,
    hidden: column.hidden,
    rect: column.rect,
  }));
  await boardStub(c.env, boardId).initialize({
    boardId,
    name: parsed.data.name ?? snapshot.name,
    adminToken,
    columns,
    workingAgreements: snapshot.workingAgreements,
    config: snapshot.config,
  });
  return c.json({ boardId, adminToken });
});

app.get("/api/boards/:id", async (c) => {
  const boardId = c.req.param("id");
  if (!isSecretShaped(boardId)) {
    return c.json({ error: "BOARD_NOT_FOUND" }, 404);
  }
  const board = await boardStub(c.env, boardId).info();
  if (board === null) {
    return c.json({ error: "BOARD_NOT_FOUND" }, 404);
  }
  return c.json({ board });
});

// Export a board. Deliberately open to any holder of the board id, not gated on
// the admin token: the board id IS a full participant capability, and the export
// carries nothing a participant cannot already read on screen. That claim is
// load-bearing, so the DO enforces it literally — the export is built under the
// reveal a viewer with NO identity would get, which during the presenting round
// means the cards of the people the rotation has already reached and nothing
// else. Pre-reveal note bodies and staged columns are omitted, tallies stay
// blind until the reveal, and an anonymous board strips note authorship.
// Gating it would mean putting the admin token in a GET URL (history, logs,
// referrers) for no confidentiality gain. Author names are excluded by default —
// pass ?authors=true to include them. docs/01 §10 states the same rule.
//
// The PDF is rendered from that SAME snapshot under that same reveal, so every
// gate above is inherited rather than re-implemented. JPEG is deliberately not
// a value this route accepts: a Worker has no canvas, so the picture is drawn
// by the browser from this route's JSON — see apps/web/src/lib/exportImage.ts.
app.get("/api/boards/:id/export", async (c) => {
  const boardId = c.req.param("id");
  if (!isSecretShaped(boardId)) {
    return c.json({ error: "BOARD_NOT_FOUND" }, 404);
  }
  const format = (c.req.query("format") ?? "md") as ExportFormat;
  if (!EXPORT_FORMATS.includes(format)) {
    return c.json({ error: "INVALID_FORMAT" }, 400);
  }
  const scope = (c.req.query("scope") ?? "all") as ExportScope;
  if (!EXPORT_SCOPES.includes(scope)) {
    return c.json({ error: "INVALID_SCOPE" }, 400);
  }
  const includeAuthors = c.req.query("authors") === "true";
  const data = await boardStub(c.env, boardId).exportBoard(includeAuthors);
  if (data === null) {
    return c.json({ error: "BOARD_NOT_FOUND" }, 404);
  }
  const filename = exportFileName(data.boardName, scope, format);
  return new Response(renderExport(format, data, scope), {
    headers: {
      "content-type": exportContentType(format),
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
});

// GIF search proxy — keeps the KLIPY key server-side and hides employee IPs /
// search terms from the provider. Degrades to empty when no key is configured.
//
// Board-scoped: the previous unscoped route was an open relay for the
// operator's provider quota, and it could not honour a board's own GIF opt-out
// because it had no board to ask. Now a caller needs a board capability, the
// board's setting is checked BEFORE any search term leaves the edge, and the
// route is rate limited per IP.
app.get("/api/boards/:id/gifs/search", async (c) => {
  {
    const boardId = c.req.param("id");
    if (!isSecretShaped(boardId)) {
      return c.json({ error: "BOARD_NOT_FOUND" }, 404);
    }
    // Budget and opt-out are answered by the SAME Durable Object call the route
    // already had to make, so throttling GIF search costs nothing extra. Keyed
    // per BOARD, not per IP: a whole team behind one office address would
    // otherwise share a single bucket and throttle each other during the
    // appreciation round, when everyone picks a GIF at once.
    const allowed = await boardStub(c.env, boardId).gifSearchAllowed();
    if (allowed === "off") {
      // Same shape as "no key configured" — for the user these are the same
      // situation: GIFs are not available here, and waiting will not change it.
      return c.json({ configured: false, gifs: [] });
    }
    if (allowed === "throttled") {
      // 429 rather than an empty result, so the picker can say "busy, try
      // again" instead of "not set up". Our own throttle is over in seconds.
      return c.json({ error: "RATE_LIMITED" }, 429, { "retry-after": "5" });
    }
    const query = c.req.query("q") ?? "";
    const locale = c.req.query("locale") ?? "en";
    const result = await searchGifs(c.env, query.slice(0, 100), locale);
    return c.json(result, 200, {
      // Private: the response is board-scoped and the URL carries a capability.
      "cache-control": "private, max-age=60",
    });
  }
});

app.get("/api/boards/:id/ws", async (c) => {
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
    return c.json({ error: "EXPECTED_WEBSOCKET" }, 426);
  }
  const boardId = c.req.param("id");
  if (!isSecretShaped(boardId)) {
    return c.json({ error: "BOARD_NOT_FOUND" }, 404);
  }
  // Forwarded to the DO, which finishes the upgrade (or 404s for boards that
  // were never created — every id resolves to a DO, existence is a meta row).
  return boardStub(c.env, boardId).fetch(c.req.raw);
});

export default app;
