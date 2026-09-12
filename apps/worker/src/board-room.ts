// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { DurableObject } from "cloudflare:workers";
import {
  canTransition,
  CURSORS_ACTIVATABLE,
  DEFAULT_PHASE_PLAN,
  DEFAULT_VOTE_CONFIG,
  EMPTY_PICKER,
  IDLE_TIMER,
  noteVisibleTo,
  parseClientCommand,
  layoutModeSchema,
  phasePlanSchema,
  phaseRevealed,
  phaseSchema,
  pickerStyleSchema,
  PROTOCOL_VERSION,
  pickerKnows,
  pickerStateSchema,
  planJoin,
  publicReveal,
  revealFor,
  rotationExhausted,
  rotiReleaseSchema,
  redactNoteForViewer,
  scatterPos,
  visibleNotesFor,
  withAllRevealed,
  withPresenterRevealed,
  type Action,
  type BoardConfig,
  type BoardInfo,
  type CanvasOccupancy,
  type ClientCommand,
  type Column,
  type Note,
  type NoteReveal,
  type Participant,
  type ParticipantRole,
  type Phase,
  type PhasePlan,
  type PickerState,
  type RejectCode,
  type ServerEvent,
  type Timer,
  type WheelSpin,
  WHEEL_HOLD_MS,
  WHEEL_SPIN_MS,
  WHEEL_START_DELAY_MS,
  wheelSpinSchema,
  type BoardExport,
  type IcebreakerId,
  type Kudo,
  type KudoCardType,
  type LayoutMode,
  type ZoneRect,
  ICEBREAKER_IDS,
  icebreakerIdSchema,
  KUDO_EVERYONE,
  presenterCardOrder,
  pickIcebreaker,
} from "@retrobeam/shared";
import { generateSecret, randomIndex, safeEqual } from "./ids.js";
import {
  CURSOR_BUDGET_KEY,
  CURSOR_DAILY_MESSAGE_LIMIT,
  CURSOR_MESSAGE_LEASE_SIZE,
  type DailyBudgetLease,
} from "./rate-limiter.js";

// Boards auto-delete after this window unless the facilitator keeps them.
export const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

// ROTI anonymity rests on TWO rules, and the count threshold alone is not one
// of them.
//
// 1. The average is published exactly ONCE, when the board leaves the closing
//    phase, and the poll is closed for good at that moment. A running mean
//    re-broadcast on every submission is trivially differenceable: an observer
//    holding consecutive aggregates computes n*avg(n) - (n-1)*avg(n-1) and
//    recovers that respondent's integer score. Simulated over random score
//    vectors, the one-decimal rounding blurs nothing at team scale — positions
//    4 through 6 are recovered exactly 100% of the time, 7 through 9 about 88%.
//    Re-scoring leaks outright, since the count holds still while the mean moves.
// 2. Below this threshold the average is withheld even at release: with one
//    respondent the average IS that person's score, and with two a co-voter
//    subtracts their own to recover the other's.
//
// Residual, stated plainly: identities are free (any client-minted sessionKey
// mints a participant), so a determined observer can pad the count. The
// one-shot release is what actually closes the differencing channel.
export const ROTI_MIN_ANONYMOUS = 3;

interface KudoRow {
  id: string;
  card_type: string;
  to_id: string;
  from_id: string | null;
  text: string;
  gif_url: string | null;
}

interface SocketAttachment {
  participantId: string | null;
  /** Token bucket, carried in the attachment so it survives hibernation — the
   *  DO keeps no in-memory session state by design. `at` is the epoch-ms the
   *  bucket was last refilled. Absent on sockets from before this shipped. */
  budget?: { tokens: number; at: number };
}

// Inbound WebSocket messages are billed at a 20:1 DISCOUNT — twenty of them
// count as one request — but the free-tier allowance is account-wide, so a
// runaway client still spends everyone's budget. At 1,000 frames a second
// (trivial for a loop, impossible for a person) that is 50 billed requests a
// second: the whole 100k daily allowance in about half an hour, and every board
// goes down with it until midnight UTC. This bucket caps one socket at 8 frames
// a second, which no human interaction approaches — a fast typist writing
// notes, a legacy canvas batch move (one frame), or a reconnect replay are all well inside
// it, and the burst allowance is fifteen seconds' worth.
const BUCKET_CAPACITY = 120;
const BUCKET_REFILL_PER_SEC = 8;
// `resync` is the one command whose cost is unbounded relative to its input —
// a tiny frame returns the whole filtered board — so it is charged heavily.
// At capacity that allows a burst of 6 (two rejections in a row legitimately
// trigger two), settling to a sustained 8/20 = 0.4 snapshots a second.
const RESYNC_COST = 20;

interface ParticipantRow {
  id: string;
  name: string;
  color: string;
  role: string;
  session_key: string;
  online: number;
  ready: number;
  demoted: number;
}

// The board-wide half of the visibility gate, resolved once per fan-out: what
// each ROLE may see right now, plus the hidden-column set. Both roles are
// carried because a facilitator is NOT simply "sees everything" — before the
// reveal nobody sees a foreign note, the facilitator included, which is the
// oldest rule in the product.
interface RevealSnapshot {
  memberReveal: NoteReveal;
  facilitatorReveal: NoteReveal;
  hidden: ReadonlySet<string>;
}

interface NoteRow {
  id: string;
  column_id: string;
  author_id: string;
  text: string;
  ord: number;
  group_id: string | null;
  gif_url: string | null;
  pos_x: number | null;
  pos_y: number | null;
}

export interface BoardCreation {
  boardId: string;
  name: string;
  adminToken: string;
  columns: Array<{
    id: string;
    name: string;
    order: number;
    hidden?: boolean;
    rect?: ZoneRect | null;
  }>;
  workingAgreements: string;
  /** opt back into an otherwise-default flow (e.g. enable the check-in phase,
   *  which is off by default). Ignored when a full `config` is supplied. */
  phasePlan?: PhasePlan;
  /** initial board layout ('columns' default); the facilitator can switch it
   *  live afterwards. Ignored when a full `config` is supplied. */
  layout?: LayoutMode;
  /** seeded when duplicating an existing board — structure only. Absent for a
   *  fresh board, which falls back to the built-in defaults. */
  config?: BoardConfig;
}

// Must fit the LARGEST frame the protocol itself permits, otherwise a legal
// command is refused before zod ever sees it: `note.moveMany` allows 300 moves
// (protocol.ts) and each serializes to ~138 chars, so a full canvas tidy is
// ~42 KB. 8 KB used to cut that off at 58 cards — the client had already
// applied its optimistic echo and never learned the frame was dropped.
// Billing counts messages, not bytes, so a larger cap costs nothing;
// the cap only exists to refuse absurd frames before paying for JSON.parse.
const MAX_FRAME_CHARS = 65536;

// Bumped when a migration step is added below the unconditional ones.
const SCHEMA_VERSION = 2;

// GIF search budget per board. Generous on purpose: the whole appreciation
// round is eight people picking a GIF at once, and the picker already debounces
// at 350 ms. Sixty a minute sustained is far past a real room and still caps
// what a board capability can spend of the operator's provider quota.
const GIF_BURST = 60;
const GIF_PER_SEC = 1;

// Phases in which notes may be created/edited by their author.
function phaseAllowsWriting(phase: Phase): boolean {
  return phase === "write" || phase === "present";
}

// Command dispatch is synchronous, so the few storage-side effects that are
// async (arming the alarm, wiping a board) cannot be awaited by their caller.
// `void promise` would drop a rejection on the floor: a failed setAlarm means
// the timer that clients are already counting down will never fire, and
// nothing would say so. Log it instead — the label only, never board content.
function detach(label: string, work: Promise<unknown>): void {
  void work.catch((error: unknown) => {
    console.error(`[BoardRoom] ${label} failed`, error);
  });
}

// One board = one BoardRoom. Uses the WebSocket Hibernation API throughout:
// no in-memory session state survives between events on purpose — everything
// a handler needs lives in SQLite or in the socket attachment.
export class BoardRoom extends DurableObject<Env> {
  private readonly sql: SqlStorage;
  private readonly bindings: Env;
  /** GIF search budget for this board. Ephemeral by design — see
   *  gifSearchAllowed(); an evicted board was idle, so there was nothing to
   *  throttle. Never persisted: the free tier's write budget belongs to notes. */
  private gifBudget = { tokens: GIF_BURST, at: 0 };
  /** A prepaid slice of the global daily cursor allowance. Losing unused
   *  tokens on hibernation is conservative and avoids a central RPC per move. */
  private cursorLease = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.bindings = env;
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS board_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS participants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        role TEXT NOT NULL,
        session_key TEXT NOT NULL UNIQUE,
        online INTEGER NOT NULL DEFAULT 0,
        ready INTEGER NOT NULL DEFAULT 0,
        demoted INTEGER NOT NULL DEFAULT 0,
        joined_at INTEGER NOT NULL,
        last_seen INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS columns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ord INTEGER NOT NULL,
        hidden INTEGER NOT NULL DEFAULT 0,
        rect_x REAL, rect_y REAL, rect_w REAL, rect_h REAL
      );
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        column_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        text TEXT NOT NULL,
        ord INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reactions (
        note_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        emoji TEXT NOT NULL,
        PRIMARY KEY (note_id, participant_id, emoji)
      );
      CREATE TABLE IF NOT EXISTS votes (
        target_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        count INTEGER NOT NULL,
        PRIMARY KEY (target_id, participant_id)
      );
      CREATE TABLE IF NOT EXISTS actions (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        owner_id TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS kudos (
        id TEXT PRIMARY KEY,
        card_type TEXT NOT NULL,
        to_id TEXT NOT NULL,
        from_id TEXT,
        text TEXT NOT NULL,
        gif_url TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS roti (
        participant_id TEXT PRIMARY KEY,
        score INTEGER NOT NULL
      );
    `);
    this.migrate();
    // Heartbeats are answered by the runtime without waking a hibernated DO.
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  // Additive schema evolution for boards created before a column existed.
  //
  // Each step is PRAGMA-sniffed and idempotent, which is why this has been safe
  // so far — but sniffing can only express "add a column if absent". A backfill,
  // a rename or a data repair is unrepresentable, because there is no way to ask
  // whether it already ran. The version marker below gives later migrations
  // somewhere to record that, without changing what the existing steps do.
  private migrate(): void {
    const from = Number(this.getMeta("schemaVersion") ?? "0");
    const participantColumns = this.sql
      .exec("PRAGMA table_info(participants)")
      .toArray()
      .map((row) => String(row.name));
    if (!participantColumns.includes("ready")) {
      this.sql.exec(
        "ALTER TABLE participants ADD COLUMN ready INTEGER NOT NULL DEFAULT 0",
      );
    }
    if (!participantColumns.includes("demoted")) {
      this.sql.exec(
        "ALTER TABLE participants ADD COLUMN demoted INTEGER NOT NULL DEFAULT 0",
      );
    }
    const noteColumns = this.sql
      .exec("PRAGMA table_info(notes)")
      .toArray()
      .map((row) => String(row.name));
    if (!noteColumns.includes("group_id")) {
      this.sql.exec("ALTER TABLE notes ADD COLUMN group_id TEXT");
    }
    if (!noteColumns.includes("gif_url")) {
      this.sql.exec("ALTER TABLE notes ADD COLUMN gif_url TEXT");
    }
    // Canvas position (normalized [0,1] within the note's zone); null = unplaced.
    if (!noteColumns.includes("pos_x")) {
      this.sql.exec("ALTER TABLE notes ADD COLUMN pos_x REAL");
    }
    if (!noteColumns.includes("pos_y")) {
      this.sql.exec("ALTER TABLE notes ADD COLUMN pos_y REAL");
    }
    const columnColumns = this.sql
      .exec("PRAGMA table_info(columns)")
      .toArray()
      .map((row) => String(row.name));
    if (!columnColumns.includes("hidden")) {
      this.sql.exec(
        "ALTER TABLE columns ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0",
      );
    }
    // Freeform zone rectangle (nullable = auto row layout).
    for (const col of ["rect_x", "rect_y", "rect_w", "rect_h"]) {
      if (!columnColumns.includes(col)) {
        this.sql.exec(`ALTER TABLE columns ADD COLUMN ${col} REAL`);
      }
    }
    // Secondary indexes. Only primary keys existed, so the hottest per-message
    // predicates were full scans, and SQLite bills rows READ. `votes` is keyed
    // (target_id, participant_id), which cannot seek by participant alone —
    // exactly what myVotes and the vote meter do on every cast.
    this.sql.exec(`
      CREATE INDEX IF NOT EXISTS notes_by_column ON notes (column_id);
      CREATE INDEX IF NOT EXISTS notes_by_group ON notes (group_id);
      CREATE INDEX IF NOT EXISTS votes_by_participant ON votes (participant_id);
      CREATE INDEX IF NOT EXISTS reactions_by_note ON reactions (note_id);
    `);

    // Presenter-scoped visibility (schemaVersion 2). A board sitting in the
    // presenting phase when this shipped had every note broadcast to everyone
    // under the old all-at-once rule; starting to scope it now would take
    // cards off screens mid-retro — the one thing this feature promises never
    // to do. Latch it open instead. No other phase needs anything: unrevealed
    // ones have revealed nothing, and every later phase is never scoped. The
    // board's NEXT round is scoped normally, because entering the presenting
    // phase from an unrevealed one starts a fresh round.
    if (this.getMeta("id") !== null && from < 2 && this.phase() === "present") {
      this.savePicker(withAllRevealed(this.picker() ?? EMPTY_PICKER));
    }

    // A one-way marker. Steps above stay idempotent and unconditional (they are
    // what brings a pre-marker board up to date); anything added below runs
    // `if (from < N)` and is recorded here. Only write it once the board
    // actually exists — an untouched DO must stay indistinguishable from one
    // that was never created, which is what makes an unknown board id 404.
    if (this.getMeta("id") !== null && from < SCHEMA_VERSION) {
      this.setMeta("schemaVersion", String(SCHEMA_VERSION));
    }
  }

  // Called once by the Worker when a board is created (RPC).
  async initialize(creation: BoardCreation): Promise<void> {
    if (this.getMeta("id") !== null) return; // idempotent: replays must not rotate the admin token
    const now = Date.now();
    const retentionAt = now + RETENTION_MS; // always a FRESH window — a copy is a new object
    // Structure carried over on duplication; otherwise the built-in defaults.
    // Identity/lifecycle fields (id, adminToken, createdAt, seq, phase,
    // retentionAt) are never seeded from a source — always fresh here.
    const config = creation.config;
    const maxPerTarget = config?.maxPerTarget;
    this.sql.exec(
      `INSERT INTO board_meta (key, value) VALUES
         ('id', ?), ('name', ?), ('adminToken', ?), ('createdAt', ?), ('seq', '0'),
         ('phase', 'lobby'), ('anonymous', ?), ('phasePlan', ?),
         ('gifsEnabled', ?), ('pickerStyle', ?), ('layout', ?),
         ('cursorsEnabled', ?), ('voterNamesEnabled', ?), ('focusMode', ?),
         ('votesPerPerson', ?), ('topN', ?), ('maxPerTarget', ?),
         ('retentionAt', ?), ('workingAgreements', ?), ('schemaVersion', ?)`,
      creation.boardId,
      creation.name,
      creation.adminToken,
      String(now),
      config?.anonymous ? "1" : "0",
      JSON.stringify(
        config?.phasePlan ?? creation.phasePlan ?? DEFAULT_PHASE_PLAN,
      ),
      config === undefined || config.gifsEnabled ? "1" : "0",
      config?.pickerStyle ?? "wheel",
      config?.layout ?? creation.layout ?? "columns",
      config?.cursorsEnabled ? "1" : "0",
      // ON for a new board — the room discusses a crowned card with the people
      // who picked it, which is the whole point of crowning it. An anonymous
      // board never shows names whatever this says (voterNamesShown), and a
      // board created BEFORE this field stays blind, because it has no row
      // here and config() reads a missing row as off. A duplicate inherits the
      // source board's choice.
      config === undefined || config.voterNamesEnabled ? "1" : "0",
      config?.focusMode ? "1" : "0",
      String(config?.votesPerPerson ?? DEFAULT_VOTE_CONFIG.votesPerPerson),
      String(config?.topN ?? DEFAULT_VOTE_CONFIG.topN),
      maxPerTarget == null ? "" : String(maxPerTarget),
      String(retentionAt),
      creation.workingAgreements,
      // Stamped HERE, not by migrate(): the constructor runs before this row
      // exists, so its version marker is skipped and a board created by this
      // build would otherwise read as version 0 forever — and take a
      // back-compat step meant for boards written by an OLDER build the first
      // time it woke from hibernation.
      String(SCHEMA_VERSION),
    );
    for (const column of creation.columns) {
      this.sql.exec(
        "INSERT INTO columns (id, name, ord, hidden, rect_x, rect_y, rect_w, rect_h) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        column.id,
        column.name,
        column.order,
        column.hidden ? 1 : 0,
        column.rect?.x ?? null,
        column.rect?.y ?? null,
        column.rect?.w ?? null,
        column.rect?.h ?? null,
      );
    }
    // Auto-delete after the retention window (GDPR / decided). The DO's single
    // alarm slot is shared with the phase timer — nearest deadline wins.
    await this.rescheduleAlarm();
  }

  // RPC: board metadata for the join page; null if never created.
  async info(): Promise<BoardInfo | null> {
    return this.getMeta("id") === null ? null : this.boardInfo();
  }

  // RPC: may this board's participants search for GIFs RIGHT NOW? Checked by
  // the proxy BEFORE a search term leaves the edge, so both the per-board
  // opt-out and its search budget are properties of the route rather than of
  // client discipline. A missing board reads as "off", like one that switched
  // GIFs off — there is nothing to protect there, since every member already
  // receives the board's gifsEnabled flag in their snapshot.
  //
  // The budget is per BOARD, which is the right unit: a team behind one office
  // address would share an IP bucket and throttle each other during the
  // appreciation round. It rides in memory for the same reason the standalone
  // limiter does — losing it when an idle board hibernates costs nothing.
  async gifSearchAllowed(): Promise<"ok" | "off" | "throttled"> {
    if (this.getMeta("id") === null || !this.config().gifsEnabled) return "off";
    const now = Date.now();
    const tokens = Math.min(
      GIF_BURST,
      this.gifBudget.tokens + ((now - this.gifBudget.at) / 1000) * GIF_PER_SEC,
    );
    this.gifBudget = { tokens: Math.max(0, tokens - 1), at: now };
    // "off" and "throttled" must NOT collapse into one answer. Off is
    // permanent and the honest message is "not set up"; throttled is over in
    // seconds and the honest message is "try again". Telling someone the
    // feature is unavailable when it is merely busy makes them stop using it.
    return tokens >= 1 ? "ok" : "throttled";
  }

  // RPC: structure-only snapshot for duplication — column names+order, board
  // config, and the working-agreements text. Deliberately returns NO
  // participant, note, vote, kudo, roti, action, or picker data: "structure,
  // never content" is a property of THIS API surface, not caller discipline, so
  // no note body or participant can ever leak into a copy — even across regions,
  // since only these fields (never content-table rows) cross the RPC boundary.
  // Gated on the source admin token; returns null if the board does not exist
  // OR the token is wrong (no existence/auth oracle beyond the id capability).
  async duplicationSnapshot(adminToken: string): Promise<{
    name: string;
    columns: Array<{
      name: string;
      order: number;
      hidden: boolean;
      rect: ZoneRect | null;
    }>;
    config: BoardConfig;
    workingAgreements: string;
  } | null> {
    const expected = this.getMeta("adminToken");
    if (
      this.getMeta("id") === null ||
      expected === null ||
      !safeEqual(adminToken, expected)
    ) {
      return null;
    }
    return {
      name: this.getMeta("name") ?? "",
      // Carry the staged (hidden) flag through so a staged column stays staged
      // in the copy — otherwise its (possibly sensitive) name would be exposed
      // to the copy's members.
      columns: this.columns().map((c) => ({
        name: c.name,
        order: c.order,
        hidden: c.hidden,
        rect: c.rect,
      })),
      config: this.config(),
      workingAgreements: this.getMeta("workingAgreements") ?? "",
    };
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return Response.json({ error: "EXPECTED_WEBSOCKET" }, { status: 426 });
    }
    if (this.getMeta("id") === null) {
      return Response.json({ error: "BOARD_NOT_FOUND" }, { status: 404 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      participantId: null,
    } satisfies SocketAttachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    // The protocol is small JSON text frames; refuse anything else before
    // paying for JSON.parse (workerd itself allows frames up to 32 MiB).
    if (typeof message !== "string" || message.length > MAX_FRAME_CHARS) {
      this.send(ws, {
        type: "error",
        code: "BAD_MESSAGE",
        message: "Frame too large or not text",
      });
      return;
    }
    const command = parseClientCommand(message);
    if (command === null) {
      this.send(ws, {
        type: "error",
        code: "BAD_MESSAGE",
        message: "Unrecognized message",
      });
      return;
    }

    // Charged before anything is done with the frame, so an over-budget client
    // pays nothing but the (already-billed) inbound message.
    if (!this.spendBudget(ws, command.type)) {
      this.send(ws, {
        type: "error",
        code: "RATE_LIMIT",
        message: "Too many messages — slow down",
      });
      return;
    }

    if (command.type === "join") {
      this.handleJoin(ws, command.name, command.sessionKey, command.adminToken);
      return;
    }
    if (command.type === "leave") {
      ws.close(1000, "left");
      return;
    }

    // Everything else requires a joined participant.
    const participant = this.participantForSocket(ws);
    if (participant === null) {
      this.send(ws, {
        type: "error",
        code: "NOT_JOINED",
        message: "Join first",
      });
      return;
    }
    if (command.type === "presence.cursor") {
      await this.handleCursor(ws, participant, command);
      return;
    }
    this.dispatchCommand(ws, participant, command);
  }

  /** Token bucket per socket, stored in the attachment so it survives
   *  hibernation. Returns false when the frame must be dropped. */
  private spendBudget(ws: WebSocket, type: ClientCommand["type"]): boolean {
    const attachment = readAttachment(ws);
    if (attachment === null) return true; // not ours to police
    const now = Date.now();
    const previous = attachment.budget ?? { tokens: BUCKET_CAPACITY, at: now };
    const refilled = Math.min(
      BUCKET_CAPACITY,
      previous.tokens + ((now - previous.at) / 1000) * BUCKET_REFILL_PER_SEC,
    );

    const cost = type === "resync" ? RESYNC_COST : 1;
    if (refilled < cost) {
      ws.serializeAttachment({
        ...attachment,
        budget: { tokens: refilled, at: now },
      } satisfies SocketAttachment);
      return false;
    }
    ws.serializeAttachment({
      ...attachment,
      budget: { tokens: refilled - cost, at: now },
    } satisfies SocketAttachment);
    return true;
  }

  private dispatchCommand(
    ws: WebSocket,
    participant: ParticipantRow,
    command: Exclude<ClientCommand, { type: "join" } | { type: "leave" }>,
  ): void {
    switch (command.type) {
      case "resync":
        this.send(ws, this.buildSync(participant, participant.session_key));
        return;
      case "presence.editing":
        this.handleEditing(ws, participant, command.columnId);
        return;
      case "ready.set":
        this.handleReadySet(participant, command.ready);
        return;
      case "note.create":
        this.handleNoteCreate(ws, participant, command);
        return;
      case "note.update":
        this.handleNoteUpdate(ws, participant, command);
        return;
      case "note.delete":
        this.handleNoteDelete(ws, participant, command);
        return;
      case "note.react":
        this.handleNoteReact(ws, participant, command);
        return;
      case "admin.phase.set":
        this.handlePhaseSet(ws, participant, command.phase);
        return;
      case "admin.timer.start":
      case "admin.timer.pause":
      case "admin.timer.resume":
      case "admin.timer.extend":
      case "admin.timer.stop":
        this.handleTimer(ws, participant, command);
        return;
      case "admin.column.create":
      case "admin.column.rename":
      case "admin.column.delete":
      case "admin.column.setHidden":
        this.handleColumn(ws, participant, command);
        return;
      case "admin.column.setRect":
        this.handleColumnSetRect(ws, participant, command);
        return;
      case "note.group":
        this.handleNoteGroup(ws, participant, command);
        return;
      case "note.ungroup":
        this.handleNoteUngroup(ws, participant, command);
        return;
      case "note.move":
        this.handleNoteMove(ws, participant, command);
        return;
      case "note.moveMany":
        this.handleNoteMoveMany(ws, participant, command);
        return;
      case "admin.picker.spin":
        this.handlePickerSpin(ws, participant);
        return;
      case "admin.picker.skip":
        this.handlePickerSkip(ws, participant);
        return;
      case "admin.picker.pick":
        this.handlePickerPick(ws, participant, command);
        return;
      case "picker.done":
        this.handlePickerDone(ws, participant);
        return;
      case "admin.picker.exclude":
      case "admin.picker.include":
        this.handlePickerPool(ws, participant, command);
        return;
      case "admin.picker.style":
        this.handlePickerStyleSet(ws, participant, command);
        return;
      case "admin.layout.set":
        this.handleLayoutSet(ws, participant, command);
        return;
      case "admin.role.set":
        this.handleRoleSet(ws, participant, command);
        return;
      case "vote.cast":
        this.handleVoteCast(ws, participant, command);
        return;
      case "admin.vote.config":
        this.handleVoteConfig(ws, participant, command);
        return;
      case "admin.discuss.focus":
        this.handleDiscussFocus(ws, participant, command);
        return;
      case "action.create":
      case "action.update":
      case "action.delete":
        this.handleAction(ws, participant, command);
        return;
      case "kudo.create":
        this.handleKudoCreate(ws, participant, command);
        return;
      case "kudo.delete":
        this.handleKudoDelete(ws, participant, command);
        return;
      case "admin.gifs.set":
        this.handleGifsSet(ws, participant, command);
        return;
      case "admin.cursors.set":
        this.handleCursorsSet(ws, participant, command);
        return;
      case "admin.voterNames.set":
        this.handleVoterNamesSet(ws, participant, command);
        return;
      case "admin.focus.set":
        this.handleFocusSet(ws, participant, command);
        return;
      case "admin.spotlight.set":
        this.handleSpotlightSet(ws, participant, command);
        return;
      case "admin.board.keep":
        detach("board.keep", this.handleBoardKeep(ws, participant));
        return;
      case "admin.board.delete":
        detach("board.delete", this.handleBoardDelete(ws, participant));
        return;
      case "admin.checkin.shuffle":
        this.handleCheckinShuffle(ws, participant);
        return;
      case "admin.agreements.set":
        this.handleAgreementsSet(ws, participant, command);
        return;
      case "roti.set":
        this.handleRotiSet(ws, participant, command);
        return;
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    this.handleDisconnect(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.handleDisconnect(ws);
  }

  // The DO has exactly ONE alarm slot, shared by the phase timer and the
  // retention auto-delete — whichever deadline is nearest is armed. On fire we
  // handle every deadline that is now due, then re-arm for whatever remains.
  override async alarm(): Promise<void> {
    const now = Date.now();

    const retentionAt = this.getMeta("retentionAt");
    if (retentionAt !== null && now >= Number(retentionAt) - 250) {
      await this.destroyBoard(); // terminal — the object is GC'd
      return;
    }

    const timerEndsAt = this.getMeta("timerEndsAt");
    if (timerEndsAt !== null && now >= Number(timerEndsAt) - 250) {
      // Broadcast BEFORE clearing: if anything throws, the at-least-once retry
      // still finds the deadline and re-broadcasts (clients dedupe).
      this.broadcastAll({ type: "timer.ended", seq: this.nextSeq() });
      this.clearTimerMeta();
    }

    await this.rescheduleAlarm();
  }

  // Arms the alarm for the nearest pending deadline (timer or retention).
  private async rescheduleAlarm(): Promise<void> {
    const deadlines = [this.getMeta("timerEndsAt"), this.getMeta("retentionAt")]
      .filter((v): v is string => v !== null)
      .map(Number);
    if (deadlines.length === 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(Math.min(...deadlines));
  }

  // Wipes all board data (leaving the empty schema so the live instance stays
  // queryable and reports the board as gone) after telling connected clients.
  // getMeta("id") now returns null everywhere → the board 404s like one that
  // never existed. deleteAll() is avoided because it drops the tables, which
  // makes a same-instance query fail with "no such table".
  private async destroyBoard(): Promise<void> {
    this.broadcastAll({ type: "board.deleted" });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(1000, "board deleted");
      } catch {
        // already closing
      }
    }
    await this.ctx.storage.deleteAlarm();
    // Content first, board_meta LAST. board_meta holds the `id` row that makes
    // the board resolvable at all, so wiping it first would 404 the board while
    // note text and participant names were still on disk if anything threw
    // mid-loop — the retention alarm would be gone too, with nothing left to
    // re-arm it.
    for (const table of [
      "notes",
      "reactions",
      "votes",
      "actions",
      "kudos",
      "roti",
      "columns",
      "participants",
      "board_meta",
    ]) {
      this.sql.exec(`DELETE FROM ${table}`);
    }
  }

  // ---------------------------------------------------------------------
  // join / leave / presence
  // ---------------------------------------------------------------------

  private handleJoin(
    ws: WebSocket,
    name: string,
    sessionKey: string | undefined,
    adminToken: string | undefined,
  ): void {
    const now = Date.now();
    const storedAdminToken = this.getMeta("adminToken");
    const tokenMatches =
      adminToken !== undefined &&
      storedAdminToken !== null &&
      safeEqual(adminToken, storedAdminToken);

    const existingRow =
      sessionKey === undefined
        ? null
        : ((this.sql
            .exec(
              "SELECT * FROM participants WHERE session_key = ?",
              sessionKey,
            )
            .toArray()[0] as unknown as ParticipantRow | undefined) ?? null);

    const takenColors = this.sql
      .exec("SELECT color FROM participants")
      .toArray()
      .map((row) => String(row.color));

    // An explicit admin.role.set demotion sticks across reconnects — the
    // stored admin token must not silently re-promote its holder.
    const isAdmin = tokenMatches && existingRow?.demoted !== 1;

    const plan = planJoin({
      requestedName: name,
      isAdmin,
      existing: existingRow ? rowToParticipant(existingRow) : null,
      takenColors,
      newId: generateSecret(),
    });
    const participant = plan.participant;
    // Adopt the client-minted key (shape-checked by the protocol schema) so a
    // retried first join reclaims the same identity; mint only for keyless
    // clients (e.g. storage-less browsers).
    const participantSessionKey =
      existingRow?.session_key ?? sessionKey ?? generateSecret();

    if (plan.isNew) {
      this.sql.exec(
        `INSERT INTO participants (id, name, color, role, session_key, online, ready, demoted, joined_at, last_seen)
         VALUES (?, ?, ?, ?, ?, 1, 0, 0, ?, ?)`,
        participant.id,
        participant.name,
        participant.color,
        participant.role,
        participantSessionKey,
        now,
        now,
      );
    } else {
      this.sql.exec(
        `UPDATE participants SET name = ?, role = ?, online = 1, last_seen = ? WHERE id = ?`,
        participant.name,
        participant.role,
        now,
        participant.id,
      );
    }

    // Latecomers during the presenting phase enter the wheel pool.
    if (this.phase() === "present") {
      const picker = this.picker();
      if (picker !== null && !pickerKnows(picker, participant.id)) {
        const updated = {
          ...picker,
          remaining: [...picker.remaining, participant.id],
        };
        this.savePicker(updated);
        this.broadcastAll(
          { type: "picker.changed", seq: this.nextSeq(), picker: updated },
          ws,
        );
      }
    }

    ws.serializeAttachment({
      participantId: participant.id,
    } satisfies SocketAttachment);
    this.send(
      ws,
      this.buildSync(
        this.participantById(participant.id) as ParticipantRow,
        participantSessionKey,
      ),
    );
    this.broadcastAll(
      { type: "presence.join", seq: this.nextSeq(), participant },
      ws,
    );
    this.broadcastMeter();
  }

  private handleDisconnect(closingSocket: WebSocket): void {
    const attachment = readAttachment(closingSocket);
    const participantId = attachment?.participantId ?? null;
    if (participantId === null) return;

    // The closing tab may have been mid-edit; its ghost card would otherwise
    // stick forever when a sibling tab keeps the participant "connected"
    // (a surviving tab re-asserts on the next focus).
    this.broadcastAll(
      { type: "presence.editing", participantId, columnId: null },
      closingSocket,
    );

    const stillConnected = this.ctx
      .getWebSockets()
      .some(
        (ws) =>
          ws !== closingSocket &&
          readAttachment(ws)?.participantId === participantId,
      );
    if (stillConnected) return; // another tab of the same person is still here

    this.sql.exec(
      "UPDATE participants SET online = 0, last_seen = ? WHERE id = ?",
      Date.now(),
      participantId,
    );
    this.broadcastAll(
      { type: "presence.leave", seq: this.nextSeq(), participantId },
      closingSocket,
    );

    this.broadcastMeter();

    // The wheel must not land on someone who left: drop them from the pool.
    // Their rejoin re-adds them via the latecomer path (pickerKnows false).
    const picker = this.picker();
    if (picker !== null && picker.remaining.includes(participantId)) {
      const before = this.revealNow();
      let updated: PickerState = {
        ...picker,
        remaining: picker.remaining.filter((id) => id !== participantId),
      };
      // The last person waiting walking out ends the round like any other
      // exhaustion — the room must not be left staring at a board only the
      // facilitator can read because somebody closed a laptop.
      if (rotationExhausted(updated)) updated = withAllRevealed(updated);
      this.savePicker(updated);
      this.broadcastAll(
        { type: "picker.changed", seq: this.nextSeq(), picker: updated },
        closingSocket,
      );
      this.broadcastNewlyVisible(before);
    }
  }

  private handleEditing(
    ws: WebSocket,
    participant: ParticipantRow,
    columnId: string | null,
  ): void {
    if (columnId !== null) {
      const column = this.columnById(columnId);
      if (column === null) return; // stale ghost, ignore
      if (column.hidden) {
        // A hidden column's id must not reach members. Only facilitators (who
        // can see the column) exchange editing presence inside it; a member
        // referencing it at all is ignored.
        if (participant.role !== "facilitator") return;
        this.broadcastToFacilitators({
          type: "presence.editing",
          participantId: participant.id,
          columnId,
        });
        return;
      }
    }
    // Ephemeral, never persisted. NOTE: when the anonymity toggle becomes
    // reachable (per-board setting UI), ghosts on anonymous boards must stop
    // carrying the participant id.
    //
    // Write phase only. Ghosts have always been RENDERED only while writing,
    // but they used to circulate in every phase — and once the presenting
    // round scopes notes by author, "X is editing in column C" would tell a
    // member that X holds a card there before X has presented it.
    if (this.phase() !== "write" && columnId !== null) return;
    this.broadcastAll(
      { type: "presence.editing", participantId: participant.id, columnId },
      ws,
    );
  }

  private handleReadySet(participant: ParticipantRow, ready: boolean): void {
    if (this.phase() === "done") return;
    this.sql.exec(
      "UPDATE participants SET ready = ? WHERE id = ?",
      ready ? 1 : 0,
      participant.id,
    );
    this.broadcastAll({
      type: "ready.changed",
      seq: this.nextSeq(),
      participantId: participant.id,
      ready,
    });
  }

  // ---------------------------------------------------------------------
  // notes
  // ---------------------------------------------------------------------

  private handleNoteCreate(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "note.create" }>,
  ): void {
    if (!phaseAllowsWriting(this.phase())) {
      this.reject(
        ws,
        cmd.opId,
        "PHASE_LOCKED",
        "Notes cannot be added in this phase",
      );
      return;
    }
    // A hidden column is invisible to members — reject exactly like a missing
    // one (no existence oracle). Facilitators may write into hidden columns.
    if (this.columnFor(cmd.columnId, participant) === null) {
      this.reject(ws, cmd.opId, "NOT_FOUND", "Column does not exist");
      return;
    }
    const existing = this.noteRowById(cmd.noteId);
    if (existing !== null) {
      if (existing.author_id === participant.id) {
        // idempotent retry of the same client-minted id
        this.ack(ws, cmd.opId);
        return;
      }
      // Colliding with a note the caller cannot see must not read differently
      // from any other invalid id — reject codes are an existence oracle.
      //
      // The residual (INVALID here vs. a successful create for a free id) is
      // deliberate: acking without writing would be a silent write-drop, and
      // the client's optimistic echo would keep a note the server never has.
      // Reaching this branch at all requires already knowing the 128-bit id of
      // a note you cannot see, and the paths that used to leak such ids —
      // note.deleted on reorg, board.columnCounts — are now per-recipient.
      const visible = noteVisibleTo(
        { authorId: existing.author_id, columnId: existing.column_id },
        participant.id,
        this.revealOf(participant),
        this.hiddenColumnsFor(participant),
      );
      this.reject(
        ws,
        cmd.opId,
        visible ? "CONFLICT" : "INVALID",
        visible ? "Note id already exists" : "Note id is not usable",
      );
      return;
    }
    // Ordering is per author before reveal — a global MAX would leak the
    // count of other participants' hidden notes through the order field.
    const ord = Number(
      this.sql
        .exec(
          "SELECT COALESCE(MAX(ord), 0) + 1 AS next FROM notes WHERE column_id = ? AND author_id = ?",
          cmd.columnId,
          participant.id,
        )
        .toArray()[0]?.next ?? 1,
    );
    this.sql.exec(
      "INSERT INTO notes (id, column_id, author_id, text, ord, created_at, gif_url, pos_x, pos_y) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      cmd.noteId,
      cmd.columnId,
      participant.id,
      cmd.text,
      ord,
      Date.now(),
      this.sanitizeGifUrl(cmd.gifUrl) ?? null,
      cmd.x ?? null,
      cmd.y ?? null,
    );
    const note = this.noteById(cmd.noteId);
    if (note === null) return;
    const seq = this.nextSeq();
    this.ack(ws, cmd.opId, seq);
    this.broadcastNoteEvent(
      (n) => ({ type: "note.created", seq, note: n }),
      note,
    );
    // Members can't see the note itself pre-reveal, but they learn the count.
    this.broadcastColumnCountsIfWriting();
  }

  private handleNoteUpdate(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "note.update" }>,
  ): void {
    const row = this.noteRowById(cmd.noteId);
    // A note the caller cannot see must answer exactly like a note that does
    // not exist — otherwise reject codes are an existence oracle for hidden
    // notes (authors always see their own, so they are unaffected).
    if (
      row === null ||
      !noteVisibleTo(
        { authorId: row.author_id, columnId: row.column_id },
        participant.id,
        this.revealOf(participant),
        this.hiddenColumnsFor(participant),
      )
    ) {
      this.reject(ws, cmd.opId, "NOT_FOUND", "Note does not exist");
      return;
    }
    if (row.author_id !== participant.id) {
      this.reject(
        ws,
        cmd.opId,
        "NOT_AUTHOR",
        "Only the author can edit a note",
      );
      return;
    }
    if (!phaseAllowsWriting(this.phase())) {
      this.reject(
        ws,
        cmd.opId,
        "PHASE_LOCKED",
        "Notes cannot be edited in this phase",
      );
      return;
    }
    // gifUrl omitted = leave as-is; explicit null = clear it; a string is
    // validated (disallowed hosts / disabled gifs drop to null).
    const gifUrl = this.sanitizeGifUrl(cmd.gifUrl);
    if (gifUrl === undefined) {
      this.sql.exec(
        "UPDATE notes SET text = ? WHERE id = ?",
        cmd.text,
        cmd.noteId,
      );
    } else {
      this.sql.exec(
        "UPDATE notes SET text = ?, gif_url = ? WHERE id = ?",
        cmd.text,
        gifUrl,
        cmd.noteId,
      );
    }
    const note = this.noteById(cmd.noteId);
    if (note === null) return;
    const seq = this.nextSeq();
    this.ack(ws, cmd.opId, seq);
    this.broadcastNoteEvent(
      (n) => ({ type: "note.updated", seq, note: n }),
      note,
    );
  }

  private handleNoteDelete(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "note.delete" }>,
  ): void {
    if (this.phase() === "done") {
      // The archived board is read-only — mirror the react/edit gates.
      this.reject(ws, cmd.opId, "PHASE_LOCKED", "The retro is finished");
      return;
    }
    const row = this.noteRowById(cmd.noteId);
    // Invisible notes behave exactly like nonexistent ones (idempotent ack,
    // NO deletion) — anything else is an existence oracle for hidden notes.
    if (
      row === null ||
      !noteVisibleTo(
        { authorId: row.author_id, columnId: row.column_id },
        participant.id,
        this.revealOf(participant),
        this.hiddenColumnsFor(participant),
      )
    ) {
      this.ack(ws, cmd.opId);
      return;
    }
    const isAdmin = participant.role === "facilitator";
    if (row.author_id !== participant.id && !isAdmin) {
      this.reject(
        ws,
        cmd.opId,
        "NOT_AUTHOR",
        "Only the author or the facilitator can delete",
      );
      return;
    }
    const note = this.noteById(cmd.noteId);
    this.sql.exec("DELETE FROM reactions WHERE note_id = ?", cmd.noteId);
    // Only ungrouped notes own their vote bucket. A stack ANCHOR's id doubles
    // as the group's vote target — purging it here would destroy the whole
    // stack's votes before repairGroupAfterLeave migrates them to the survivor.
    if (row.group_id === null) {
      this.sql.exec("DELETE FROM votes WHERE target_id = ?", cmd.noteId);
    }
    this.sql.exec("DELETE FROM notes WHERE id = ?", cmd.noteId);
    const repairedIds =
      row.group_id === null
        ? []
        : this.repairGroupAfterLeave(row.group_id, cmd.noteId);
    // A deleted votable (or a re-anchored stack) may have stranded own-votes,
    // shifted the meter, or dropped a crown/focus — re-sync the room.
    this.reconcileAfterVoteMutation();
    // The facilitator may delete any card mid-round, the staged one included.
    this.reconcileSpotlight();
    const seq = this.nextSeq();
    this.ack(ws, cmd.opId, seq);
    for (const id of repairedIds) {
      const updated = this.noteById(id);
      if (updated === null) continue;
      const updateSeq = this.nextSeq();
      this.broadcastNoteEvent(
        (n) => ({ type: "note.updated", seq: updateSeq, note: n }),
        updated,
      );
    }
    if (note !== null) {
      // Only recipients who could SEE the note learn about its deletion —
      // sending the id of a note hidden from them (foreign pre-reveal, or in a
      // staged column) would leak its existence.
      const board = this.revealNow();
      this.broadcastEach((recipientId) => {
        const gate = this.gateFor(recipientId, board);
        return noteVisibleTo(note, recipientId, gate.reveal, gate.hidden)
          ? { type: "note.deleted", seq, noteId: cmd.noteId }
          : null;
      });
    }
    // Deleting during write lowers the anonymized count members see.
    this.broadcastColumnCountsIfWriting();
  }

  private handleNoteReact(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "note.react" }>,
  ): void {
    const phase = this.phase();
    if (!phaseRevealed(phase) || phase === "done") {
      this.reject(
        ws,
        cmd.opId,
        "PHASE_LOCKED",
        "Reactions are available after the reveal",
      );
      return;
    }
    const reactRow = this.noteRowById(cmd.noteId);
    // A note the caller cannot see — foreign before the reveal, or in a column
    // hidden from a member — answers exactly like a nonexistent one (no
    // existence oracle), and a member can never react onto a staged note.
    if (
      reactRow === null ||
      !noteVisibleTo(
        { authorId: reactRow.author_id, columnId: reactRow.column_id },
        participant.id,
        this.revealOf(participant),
        this.hiddenColumnsFor(participant),
      )
    ) {
      this.reject(ws, cmd.opId, "NOT_FOUND", "Note does not exist");
      return;
    }
    if (cmd.on) {
      this.sql.exec(
        "INSERT OR IGNORE INTO reactions (note_id, participant_id, emoji) VALUES (?, ?, ?)",
        cmd.noteId,
        participant.id,
        cmd.emoji,
      );
    } else {
      this.sql.exec(
        "DELETE FROM reactions WHERE note_id = ? AND participant_id = ? AND emoji = ?",
        cmd.noteId,
        participant.id,
        cmd.emoji,
      );
    }
    const note = this.noteById(cmd.noteId);
    if (note === null) return;
    const seq = this.nextSeq();
    this.ack(ws, cmd.opId, seq);
    this.broadcastNoteEvent(
      (n) => ({ type: "note.updated", seq, note: n }),
      note,
    );
  }

  // ---------------------------------------------------------------------
  // admin: phases, timer, columns
  // ---------------------------------------------------------------------

  private handlePhaseSet(
    ws: WebSocket,
    participant: ParticipantRow,
    target: Phase,
  ): void {
    if (participant.role !== "facilitator") {
      this.reject(
        ws,
        undefined,
        "NOT_ADMIN",
        "Only the facilitator controls phases",
      );
      return;
    }
    const current = this.phase();
    if (!canTransition(current, target, this.phasePlan())) {
      this.reject(
        ws,
        undefined,
        "INVALID",
        `Cannot go from ${current} to ${target}`,
      );
      return;
    }

    // The gate as it stood BEFORE the phase moved — broadcastNewlyVisible
    // diffs against it, so every widening (and there are several in this
    // handler) is delivered by one code path at the end.
    const before = this.revealNow();

    this.setMeta("phase", target);
    this.sql.exec("UPDATE participants SET ready = 0");
    this.sql.exec(
      // lastSpin too: a reconnect within the wheel's hold window would
      // otherwise replay the animation in whatever phase the board is now in.
      "DELETE FROM board_meta WHERE key IN ('discussFocus', 'meterState', 'lastSpin', 'spotlight')",
    );
    this.clearTimerMeta();
    // Re-arm for retention (must NOT drop the retention alarm on phase change).
    detach("rescheduleAlarm(phase)", this.rescheduleAlarm());

    this.broadcastAll({
      type: "phase.changed",
      seq: this.nextSeq(),
      phase: target,
    });

    // Voting closes when the board moves from vote to discuss: everyone gets
    // the tallies and the crowned top-N in one reveal.
    if (current === "vote" && target === "discuss") {
      const { tallies, topTargetIds, voters } = this.talliesAndTop();
      this.broadcastAll({
        type: "votes.revealed",
        seq: this.nextSeq(),
        tallies,
        topTargetIds,
        voters,
      });
    }
    if (target === "vote") {
      // The budget may have been lowered while the board was rewound out of
      // the vote phase; clamp before anyone sees their dots, otherwise voters
      // carry an over-budget allocation into the new round.
      this.clampVotesToConfig();
      // Votes may have migrated while regrouping in "present" — re-send every
      // voter their (possibly re-keyed) own votes so no dots are stranded.
      this.broadcastAllProgress();
      this.broadcastMeter(true);
    }

    // Every entry into "present": the pool covers everyone currently online
    // who is not already in the rotation (or deliberately excluded). The
    // picker itself persists across phase changes and rewinds.
    if (target === "present") {
      const online = this.sql
        .exec("SELECT id FROM participants WHERE online = 1")
        .toArray()
        .map((row) => String(row.id));
      const existing = this.picker();
      const base: PickerState = existing ?? EMPTY_PICKER;
      const missing = online.filter((id) => !pickerKnows(base, id));
      const merged: PickerState = {
        ...base,
        remaining: [...base.remaining, ...missing],
      };
      // A NEW presenting round, and the one point where the reveal may legally
      // go backwards: coming from an unrevealed phase, every member's client
      // has already dropped foreign notes, so clearing takes nothing off any
      // screen. Guarded on the phase we came FROM — a vote→present rewind is a
      // step back INTO a round the room is already reading, and re-narrowing
      // that would retract cards.
      //
      // Exhaustion is judged on the MERGED pool, not the old one: a room that
      // already presented everyone and came back round has nobody left to
      // stage, so it must start open rather than dark forever — but a fresh
      // board, whose pool is empty only until the newcomers are folded in, must
      // not be mistaken for one.
      //
      // Whoever still holds the mic is seeded back in: the picker survives a
      // rewind with `current` intact, and withPresenterRevealed only ever runs
      // when somebody is DRAWN — so a presenter carried across the reset would
      // otherwise present to a room that had been shown none of their cards,
      // and would never get a second chance to be added.
      const reset = !phaseRevealed(current);
      const picker: PickerState = reset
        ? {
            ...merged,
            revealed: merged.current === null ? [] : [merged.current],
            revealedAll: rotationExhausted(merged),
          }
        : merged;
      const changed =
        existing === null ||
        missing.length > 0 ||
        picker.revealed.length !== base.revealed.length ||
        picker.revealedAll !== base.revealedAll;
      if (changed) {
        this.savePicker(picker);
        this.broadcastAll({
          type: "picker.changed",
          seq: this.nextSeq(),
          picker,
        });
      }
    }

    // Every revealed phase other than the presenting round hands the whole
    // board over. Latched on the picker so a later rewind INTO "present"
    // cannot re-narrow what the room is already reading. Broadcast, not just
    // saved: the picker is client state, and a latch nobody is told about
    // would leave every fold disagreeing with the next snapshot.
    if (phaseRevealed(target) && target !== "present") {
      const picker = this.picker();
      if (picker !== null && !picker.revealedAll) {
        const opened = withAllRevealed(picker);
        this.savePicker(opened);
        this.broadcastAll({
          type: "picker.changed",
          seq: this.nextSeq(),
          picker: opened,
        });
      }
    }

    // Everything that just became visible, delivered by the one delta helper:
    // the facilitator receiving the board on entering "present", the room
    // receiving the rest of it on leaving, and nothing at all on a rewind.
    // (Rewinds need no un-reveal event — clients drop foreign notes on the way
    // into an unrevealed phase.) A staged column stays withheld from members
    // throughout; its notes reach them only when the facilitator reveals it.
    this.broadcastNewlyVisible(before);

    // Leaving the closing phase publishes the ROTI result, exactly once, and
    // closes the poll. Until this moment nobody — facilitator included — has
    // seen an average, so there is no sequence of aggregates to difference.
    if (current === "close") {
      this.releaseRoti();
    }

    // Entering close/done: re-push existing kudos so a rewind-then-re-enter
    // doesn't leave connected clients with an empty wall (their reducer
    // cleared kudos on the way out). Idempotent upserts on the client.
    if (target === "close" || target === "done") {
      for (const kudo of this.allKudos()) {
        this.broadcastAll({ type: "kudo.created", seq: this.nextSeq(), kudo });
      }
    }

    // First entry into check-in picks an icebreaker (persists across rewinds
    // so the room doesn't get a new question every time it re-enters).
    if (target === "checkin" && this.icebreakerId() === null) {
      this.shuffleIcebreaker();
    }

    // Entering (or rewinding into) write: seed everyone with the current
    // per-column totals so the "cards from the team" placeholder is right away.
    if (target === "write") {
      this.broadcastColumnCountsIfWriting();
    }
  }

  private handleTimer(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<
      ClientCommand,
      {
        type: `admin.timer.${"start" | "pause" | "resume" | "extend" | "stop"}`;
      }
    >,
  ): void {
    if (participant.role !== "facilitator") {
      this.reject(
        ws,
        undefined,
        "NOT_ADMIN",
        "Only the facilitator controls the timer",
      );
      return;
    }
    const now = Date.now();
    const timer = this.timer();

    switch (cmd.type) {
      case "admin.timer.start": {
        this.setTimerMeta(now + cmd.durationSec * 1000, null);
        break;
      }
      case "admin.timer.pause": {
        if (timer.endsAt === null) {
          this.reject(ws, undefined, "INVALID", "No running timer");
          return;
        }
        this.setTimerMeta(null, Math.max(0, timer.endsAt - now));
        break;
      }
      case "admin.timer.resume": {
        if (timer.pausedRemainingMs === null) {
          this.reject(ws, undefined, "INVALID", "No paused timer");
          return;
        }
        this.setTimerMeta(now + timer.pausedRemainingMs, null);
        break;
      }
      case "admin.timer.extend": {
        if (timer.endsAt !== null) {
          this.setTimerMeta(timer.endsAt + cmd.addSec * 1000, null);
        } else if (timer.pausedRemainingMs !== null) {
          this.setTimerMeta(null, timer.pausedRemainingMs + cmd.addSec * 1000);
        } else {
          this.reject(ws, undefined, "INVALID", "No timer to extend");
          return;
        }
        break;
      }
      case "admin.timer.stop": {
        this.clearTimerMeta();
        break;
      }
    }
    // One alarm slot, shared with retention — re-arm for the nearest deadline.
    detach("rescheduleAlarm(timer)", this.rescheduleAlarm());

    this.broadcastAll({
      type: "timer.changed",
      seq: this.nextSeq(),
      timer: this.timer(),
      serverNow: now,
    });
  }

  private handleColumn(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<
      ClientCommand,
      {
        type: `admin.column.${"create" | "rename" | "delete" | "setHidden"}`;
      }
    >,
  ): void {
    if (participant.role !== "facilitator") {
      this.reject(
        ws,
        cmd.opId,
        "NOT_ADMIN",
        "Only the facilitator manages columns",
      );
      return;
    }
    // An archived board is frozen for everyone, facilitator included — the
    // same rule note.delete/update/react and admin.vote.config already apply.
    if (this.phase() === "done") {
      this.reject(ws, cmd.opId, "PHASE_LOCKED", "The retro is finished");
      return;
    }
    switch (cmd.type) {
      case "admin.column.create": {
        if (this.columnById(cmd.columnId) !== null) {
          this.ack(ws, cmd.opId); // idempotent retry
          return;
        }
        const ord = Number(
          this.sql
            .exec("SELECT COALESCE(MAX(ord), -1) + 1 AS next FROM columns")
            .toArray()[0]?.next ?? 0,
        );
        this.sql.exec(
          "INSERT INTO columns (id, name, ord) VALUES (?, ?, ?)",
          cmd.columnId,
          cmd.name,
          ord,
        );
        const column = this.columnById(cmd.columnId);
        if (column === null) return;
        const seq = this.nextSeq();
        this.ack(ws, cmd.opId, seq);
        // New columns are visible → everyone sees it (broadcastColumnEvent).
        this.broadcastColumnEvent({ type: "column.created", seq, column });
        return;
      }
      case "admin.column.rename": {
        if (this.columnById(cmd.columnId) === null) {
          this.reject(ws, cmd.opId, "NOT_FOUND", "Column does not exist");
          return;
        }
        this.sql.exec(
          "UPDATE columns SET name = ? WHERE id = ?",
          cmd.name,
          cmd.columnId,
        );
        const column = this.columnById(cmd.columnId);
        if (column === null) return;
        const seq = this.nextSeq();
        this.ack(ws, cmd.opId, seq);
        // A hidden column's new name must not reach members.
        this.broadcastColumnEvent({ type: "column.renamed", seq, column });
        return;
      }
      case "admin.column.delete": {
        const column = this.columnById(cmd.columnId);
        if (column === null) {
          this.ack(ws, cmd.opId); // idempotent
          return;
        }
        this.sql.exec(
          "DELETE FROM reactions WHERE note_id IN (SELECT id FROM notes WHERE column_id = ?)",
          cmd.columnId,
        );
        this.sql.exec(
          "DELETE FROM votes WHERE target_id IN (SELECT id FROM notes WHERE column_id = ?) OR target_id IN (SELECT DISTINCT group_id FROM notes WHERE column_id = ? AND group_id IS NOT NULL)",
          cmd.columnId,
          cmd.columnId,
        );
        this.sql.exec("DELETE FROM notes WHERE column_id = ?", cmd.columnId);
        this.sql.exec("DELETE FROM columns WHERE id = ?", cmd.columnId);
        this.reconcileAfterVoteMutation();
        // Deleting the column purges its notes — the stage must let go of one.
        this.reconcileSpotlight();
        const seq = this.nextSeq();
        this.ack(ws, cmd.opId, seq);
        const deleted: ServerEvent = {
          type: "column.deleted",
          seq,
          columnId: cmd.columnId,
        };
        // Members never had a hidden column — don't even leak its id.
        if (column.hidden) {
          this.broadcastToFacilitators(deleted);
        } else {
          this.broadcastAll(deleted);
        }
        return;
      }
      case "admin.column.setHidden": {
        this.handleColumnSetHidden(ws, cmd);
        return;
      }
    }
  }

  // Hide/reveal a staged column. The hidden flag itself, the column's
  // name/existence, and its notes must never reach a member — so delivery is
  // per-recipient: facilitators get column.updated (with the flag); members get
  // column.deleted on hide (their reducer drops the column AND its notes) or
  // column.created + their now-visible notes on reveal. The snapshot (buildSync)
  // enforces the same rule, so a reconnect can't leak either.
  private handleColumnSetHidden(
    ws: WebSocket,
    cmd: Extract<ClientCommand, { type: "admin.column.setHidden" }>,
  ): void {
    const column = this.columnById(cmd.columnId);
    if (column === null) {
      this.reject(ws, cmd.opId, "NOT_FOUND", "Column does not exist");
      return;
    }
    if (column.hidden === cmd.hidden) {
      this.ack(ws, cmd.opId); // idempotent no-op
      return;
    }
    const before = this.revealNow();
    this.sql.exec(
      "UPDATE columns SET hidden = ? WHERE id = ?",
      cmd.hidden ? 1 : 0,
      cmd.columnId,
    );
    const updated: Column = { ...column, hidden: cmd.hidden };
    const seq = this.nextSeq();
    this.ack(ws, cmd.opId, seq);
    this.broadcastEach((recipientId) => {
      if (this.participantById(recipientId)?.role === "facilitator") {
        return { type: "column.updated", seq, column: updated };
      }
      return cmd.hidden
        ? { type: "column.deleted", seq, columnId: cmd.columnId }
        : { type: "column.created", seq, column: updated };
    });
    // On reveal, follow the column with the notes now visible to each member
    // (facilitators already had them). The delta helper decides that, so the
    // presenting round's own scoping applies here too — revealing a column
    // mid-rotation must not hand members the cards of authors who have not
    // presented yet.
    // `before` was taken ahead of the UPDATE, so it still carries this column
    // as hidden — exactly the "could you see it a moment ago?" the diff needs.
    if (!cmd.hidden) this.broadcastNewlyVisible(before);
    // Hiding removes the column's notes from the votable set (reveal restores
    // them); recompute any revealed tallies/crowns so they never reference a
    // hidden note.
    this.reconcileAfterVoteMutation();
    // Staging the column that holds the staged card takes it off every screen.
    this.reconcileSpotlight();
    // And re-send the per-column totals: the reducer's column.deleted case
    // drops the column but not its count, so a member's folded state kept an
    // entry keyed by a column they can no longer see — a snapshot disagreement
    // on a field the symmetry harness compares. Returns early outside write.
    this.broadcastColumnCountsIfWriting();
  }

  // Move/resize a zone on the canvas (facilitator only). Pure layout — the
  // notes are untouched; committed once on drop.
  private handleColumnSetRect(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "admin.column.setRect" }>,
  ): void {
    if (participant.role !== "facilitator") {
      this.reject(
        ws,
        cmd.opId,
        "NOT_ADMIN",
        "Only the facilitator moves zones",
      );
      return;
    }
    // An archived board is frozen for everyone, facilitator included — the
    // same rule note.delete/update/react and admin.vote.config already apply.
    if (this.phase() === "done") {
      this.reject(ws, cmd.opId, "PHASE_LOCKED", "The retro is finished");
      return;
    }
    const column = this.columnById(cmd.columnId);
    if (column === null) {
      this.reject(ws, cmd.opId, "NOT_FOUND", "Column does not exist");
      return;
    }
    const rect = cmd.rect;
    this.sql.exec(
      "UPDATE columns SET rect_x = ?, rect_y = ?, rect_w = ?, rect_h = ? WHERE id = ?",
      rect.x,
      rect.y,
      rect.w,
      rect.h,
      cmd.columnId,
    );
    const seq = this.nextSeq();
    this.ack(ws, cmd.opId, seq);
    // A hidden zone's geometry must not reach members (mirror setHidden).
    this.broadcastColumnEvent({
      type: "column.updated",
      seq,
      column: { ...column, rect },
    });
  }

  // A column-bearing event goes to everyone when the column is visible, but only
  // to facilitators when it is hidden — members must not learn a hidden column's
  // name or existence.
  private broadcastColumnEvent(
    event: Extract<
      ServerEvent,
      { type: "column.created" | "column.renamed" | "column.updated" }
    >,
  ): void {
    if (!event.column.hidden) {
      this.broadcastAll(event);
      return;
    }
    this.broadcastToFacilitators(event);
  }

  private broadcastToFacilitators(event: ServerEvent): void {
    this.broadcastEach((recipientId) =>
      this.participantById(recipientId)?.role === "facilitator" ? event : null,
    );
  }

  // ---------------------------------------------------------------------
  // grouping & moving (revealed phases: the board is curated collectively)
  // ---------------------------------------------------------------------

  private handleNoteGroup(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "note.group" }>,
  ): void {
    const phase = this.phase();
    // Stacks are votables — their membership must be stable once voting
    // starts, so grouping is a presenting-phase activity (rewind to regroup).
    if (phase !== "present") {
      this.reject(
        ws,
        cmd.opId,
        "PHASE_LOCKED",
        "Grouping happens in the presenting phase",
      );
      return;
    }
    if (cmd.noteId === cmd.targetNoteId) {
      this.reject(ws, cmd.opId, "INVALID", "Cannot group a note with itself");
      return;
    }
    const note = this.noteRowById(cmd.noteId);
    const target = this.noteRowById(cmd.targetNoteId);
    // A note this participant cannot see — in a column staged away from them,
    // or belonging to someone who has not presented yet — is treated like a
    // nonexistent one, for the note AND for the target it would be grouped
    // into (existence oracle). This is the one visibility check the compiler
    // cannot enumerate, because it has to test two notes at once.
    const hidden = this.hiddenColumnsFor(participant);
    const reveal = this.revealOf(participant);
    const visible = (row: NoteRow): boolean =>
      noteVisibleTo(
        { authorId: row.author_id, columnId: row.column_id },
        participant.id,
        reveal,
        hidden,
      );
    if (
      note === null ||
      target === null ||
      !visible(note) ||
      !visible(target)
    ) {
      this.reject(ws, cmd.opId, "NOT_FOUND", "Note does not exist");
      return;
    }
    // Deterministic group id: the target's group, or the target note's own id
    // — the client's optimistic echo predicts the same value.
    const groupId = target.group_id ?? target.id;
    if (note.group_id === groupId) {
      this.ack(ws, cmd.opId); // idempotent
      return;
    }
    const leftGroup = note.group_id;
    const changed: string[] = [];
    // Where each note sat before this command, so the fan-out can tell "you
    // lost sight of it" from "you never had it".
    const columnBefore = new Map<string, string>([
      [note.id, note.column_id],
      [target.id, target.column_id],
    ]);
    if (target.group_id === null) {
      this.sql.exec(
        "UPDATE notes SET group_id = ? WHERE id = ?",
        groupId,
        target.id,
      );
    }
    // The target is re-sent either way. When it was already an anchor its row
    // does not change, but a client whose copy arrived with the groupId
    // stripped (the anchor was invisible to them) predicted the target's own
    // id as the new stack and would otherwise keep that phantom until its next
    // resync. The event is an idempotent upsert, so re-sending costs a frame
    // and settles it.
    changed.push(target.id);
    let ord = Number(note.ord);
    if (target.column_id !== note.column_id) {
      // Same per-(column, author) ordering rule as note.move — grouping into
      // another column must not import a foreign ord.
      ord = Number(
        this.sql
          .exec(
            "SELECT COALESCE(MAX(ord), 0) + 1 AS next FROM notes WHERE column_id = ? AND author_id = ?",
            target.column_id,
            note.author_id,
          )
          .toArray()[0]?.next ?? 1,
      );
    }
    this.sql.exec(
      "UPDATE notes SET group_id = ?, column_id = ?, ord = ? WHERE id = ?",
      groupId,
      target.column_id,
      ord,
      note.id,
    );
    // Votes cast on the note in an earlier round follow it into the stack —
    // but ONLY when the note was its own votable. A note that was already in a
    // stack votes under that stack's id, and for the stack's anchor that id is
    // the note's own id: migrating it here would hand the whole old stack's
    // votes to the destination and leave the survivors with none (their own
    // re-key in repairGroupAfterLeave would then find an empty bucket).
    if (leftGroup === null && note.id !== groupId) {
      this.migrateVotes(note.id, groupId);
    }
    changed.push(note.id);
    if (leftGroup !== null) {
      changed.push(...this.repairGroupAfterLeave(leftGroup, note.id));
    }
    this.ack(ws, cmd.opId);
    for (const id of changed) {
      const updated = this.noteById(id);
      if (updated === null) continue;
      // Grouping onto a target in a staged column moves the note there —
      // reorg-aware delivery drops it from members who can no longer see it.
      this.broadcastNoteReorg(updated, columnBefore.get(id));
    }
    // …and that move can carry the staged card out of sight, same as a plain
    // note.move.
    this.reconcileSpotlight();
  }

  private handleNoteUngroup(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "note.ungroup" }>,
  ): void {
    const phase = this.phase();
    // Stacks are votables — their membership must be stable once voting
    // starts, so grouping is a presenting-phase activity (rewind to regroup).
    if (phase !== "present") {
      this.reject(
        ws,
        cmd.opId,
        "PHASE_LOCKED",
        "Grouping happens in the presenting phase",
      );
      return;
    }
    const note = this.noteRowById(cmd.noteId);
    // A note in a column hidden from a member is invisible — answer like a
    // nonexistent one (existence oracle) so a member cannot probe or mutate a
    // staged stack, mirroring note.move / note.group.
    if (
      note === null ||
      !noteVisibleTo(
        { authorId: note.author_id, columnId: note.column_id },
        participant.id,
        this.revealOf(participant),
        this.hiddenColumnsFor(participant),
      )
    ) {
      this.reject(ws, cmd.opId, "NOT_FOUND", "Note does not exist");
      return;
    }
    // Decided against the note AS THIS CALLER SEES IT. Their copy of a card
    // whose stack anchor is invisible to them arrived ungrouped
    // (redactNoteForViewer), so unstacking it has to look exactly like
    // unstacking a loose card: an ack that touched nothing. Answering
    // differently would re-derive, through the side channel of a following
    // note.updated, the very bit the redaction withholds — that this card is
    // stacked with one the rotation has not reached.
    const anchor =
      note.group_id === null ? null : this.noteRowById(note.group_id);
    // A dangling anchor (the row is gone) reads as visible on purpose: there is
    // no note left for the id to name, and the repair below is what clears it.
    const anchorVisible =
      note.group_id === null ||
      anchor === null ||
      noteVisibleTo(
        { authorId: anchor.author_id, columnId: anchor.column_id },
        participant.id,
        this.revealOf(participant),
        this.hiddenColumnsFor(participant),
      );
    if (note.group_id === null || !anchorVisible) {
      this.ack(ws, cmd.opId); // idempotent, or a stack this viewer never held
      return;
    }
    const groupId = note.group_id;
    this.sql.exec("UPDATE notes SET group_id = NULL WHERE id = ?", note.id);
    const changed = [note.id];
    changed.push(...this.repairGroupAfterLeave(groupId, note.id));
    this.ack(ws, cmd.opId);
    for (const id of changed) {
      const updated = this.noteById(id);
      if (updated === null) continue;
      const seq = this.nextSeq();
      this.broadcastNoteEvent(
        (n) => ({ type: "note.updated", seq, note: n }),
        updated,
      );
    }
  }

  private handleNoteMove(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "note.move" }>,
  ): void {
    const phase = this.phase();
    // Like grouping, moving reorganizes votables — frozen once voting starts.
    if (phase !== "write" && phase !== "present") {
      this.reject(
        ws,
        cmd.opId,
        "PHASE_LOCKED",
        "The board is locked for reorganizing",
      );
      return;
    }
    const note = this.noteRowById(cmd.noteId);
    // Invisible notes (foreign, or in a column hidden from a member) answer like
    // nonexistent ones (existence oracle).
    if (
      note === null ||
      !noteVisibleTo(
        { authorId: note.author_id, columnId: note.column_id },
        participant.id,
        this.revealOf(participant),
        this.hiddenColumnsFor(participant),
      )
    ) {
      this.reject(ws, cmd.opId, "NOT_FOUND", "Note does not exist");
      return;
    }
    // Before the reveal you sort only your own notes; afterwards the board is
    // curated collectively.
    if (phase === "write" && note.author_id !== participant.id) {
      this.reject(
        ws,
        cmd.opId,
        "NOT_AUTHOR",
        "Only the author can move this note",
      );
      return;
    }
    // A member cannot move a note INTO a column hidden from them, and no one can
    // move into a nonexistent column.
    if (this.columnFor(cmd.columnId, participant) === null) {
      this.reject(ws, cmd.opId, "NOT_FOUND", "Column does not exist");
      return;
    }
    // Column-mode no-op: same zone, ungrouped, and NOT a canvas reposition.
    // (A grouped note dropped on its own column with x absent still falls
    // through below — that is the column-mode drag-to-ungroup gesture.)
    if (
      note.column_id === cmd.columnId &&
      note.group_id === null &&
      cmd.x === undefined
    ) {
      this.ack(ws, cmd.opId); // no-op
      return;
    }
    // Canvas reposition within the SAME zone: persist x,y, KEEP ord and the
    // stack (on the canvas a stack is split only via note.ungroup, never by a
    // same-zone drag). Column membership and grouping are untouched.
    if (note.column_id === cmd.columnId && cmd.x !== undefined) {
      this.sql.exec(
        "UPDATE notes SET pos_x = ?, pos_y = ? WHERE id = ?",
        cmd.x,
        cmd.y ?? null,
        note.id,
      );
      const repositioned = this.noteById(note.id);
      this.ack(ws, cmd.opId);
      if (repositioned !== null) this.broadcastNoteReorg(repositioned);
      // Teammates do not receive the private note event while writing, but
      // their anonymous occupied-space placeholders must follow the move.
      this.broadcastColumnCountsIfWriting();
      return;
    }
    const leftGroup = note.group_id;
    const ord = Number(
      this.sql
        .exec(
          "SELECT COALESCE(MAX(ord), 0) + 1 AS next FROM notes WHERE column_id = ? AND author_id = ?",
          cmd.columnId,
          note.author_id,
        )
        .toArray()[0]?.next ?? 1,
    );
    // Cross-zone move (canvas or column). Canvas drops carry x,y for the new
    // zone; column-mode moves omit them, which clears any stale position.
    this.sql.exec(
      "UPDATE notes SET column_id = ?, ord = ?, group_id = NULL, pos_x = ?, pos_y = ? WHERE id = ?",
      cmd.columnId,
      ord,
      cmd.x ?? null,
      cmd.y ?? null,
      note.id,
    );
    const changed = [note.id];
    if (leftGroup !== null) {
      changed.push(...this.repairGroupAfterLeave(leftGroup, note.id));
    }
    this.ack(ws, cmd.opId);
    for (const id of changed) {
      const updated = this.noteById(id);
      if (updated === null) continue;
      // A move can land a note in a staged column — reorg-aware delivery drops
      // it from members who can no longer see it. Only the moved note changed
      // column; repaired group members stayed where they were.
      this.broadcastNoteReorg(
        updated,
        id === note.id ? note.column_id : undefined,
      );
    }
    // A move can land the STAGED card in a hidden column, which withdraws it
    // from every member — the stage has to follow, or the stored id keeps
    // naming a card the room can no longer see (and a fresh sync would
    // disagree with a folded one).
    this.reconcileSpotlight();
    // Moving between columns during write shifts the per-column totals.
    this.broadcastColumnCountsIfWriting();
  }

  // Tidy / arrange-all: apply many canvas repositions from ONE frame. Each move
  // stays within its own zone (columnId unchanged) and follows the same
  // visibility/authorship rules as a single reposition; invalid moves are
  // silently skipped so a stale card in the batch can't fail the whole tidy.
  private handleNoteMoveMany(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "note.moveMany" }>,
  ): void {
    const phase = this.phase();
    if (phase !== "write" && phase !== "present") {
      this.reject(
        ws,
        cmd.opId,
        "PHASE_LOCKED",
        "The board is locked for reorganizing",
      );
      return;
    }
    const hidden = this.hiddenColumnsFor(participant);
    // Hoisted out of the loop: one reveal for the whole batch, not one per move.
    const reveal = this.revealOf(participant);
    const movedIds: string[] = [];
    for (const move of cmd.moves) {
      const row = this.noteRowById(move.noteId);
      if (
        row === null ||
        // invisible to the caller, or a member's foreign note pre-reveal
        !noteVisibleTo(
          { authorId: row.author_id, columnId: row.column_id },
          participant.id,
          reveal,
          hidden,
        ) ||
        // before the reveal you only tidy your own cards
        (phase === "write" && row.author_id !== participant.id) ||
        // tidy keeps a card in its zone — ignore a cross-zone move here
        move.columnId !== row.column_id
      ) {
        continue;
      }
      this.sql.exec(
        "UPDATE notes SET pos_x = ?, pos_y = ? WHERE id = ?",
        move.x,
        move.y,
        move.noteId,
      );
      movedIds.push(move.noteId);
    }
    this.ack(ws, cmd.opId);
    for (const id of movedIds) {
      const updated = this.noteById(id);
      if (updated !== null) this.broadcastNoteReorg(updated);
    }
    if (movedIds.length > 0) this.broadcastColumnCountsIfWriting();
  }

  /** Keeps two invariants after a note leaves (or is deleted from) a group:
   *  a group of one is no group, and a group's id is always the id of a
   *  CURRENT member — otherwise a later drop onto the freed anchor note
   *  would silently merge with the old group. Returns the changed note ids. */
  private repairGroupAfterLeave(
    groupId: string,
    leavingNoteId: string,
  ): string[] {
    const members = this.sql
      .exec("SELECT id FROM notes WHERE group_id = ?", groupId)
      .toArray()
      .map((row) => String(row.id));
    if (members.length === 1) {
      const lastId = members[0] as string;
      this.sql.exec("UPDATE notes SET group_id = NULL WHERE id = ?", lastId);
      if (groupId !== lastId) this.migrateVotes(groupId, lastId);
      return [lastId];
    }
    if (members.length >= 2 && groupId === leavingNoteId) {
      const newGroupId = [...members].sort()[0] as string;
      this.sql.exec(
        "UPDATE notes SET group_id = ? WHERE group_id = ?",
        newGroupId,
        groupId,
      );
      this.migrateVotes(groupId, newGroupId);
      return members;
    }
    return [];
  }

  // ---------------------------------------------------------------------
  // picker (who presents next) & roles
  // ---------------------------------------------------------------------

  private handlePickerSpin(ws: WebSocket, participant: ParticipantRow): void {
    if (participant.role !== "facilitator") {
      this.reject(
        ws,
        undefined,
        "NOT_ADMIN",
        "Only the facilitator spins the wheel",
      );
      return;
    }
    if (this.phase() !== "present") {
      this.reject(
        ws,
        undefined,
        "PHASE_LOCKED",
        "The wheel spins in the presenting phase",
      );
      return;
    }
    // A double-click (or a second facilitator) must not steal the freshly
    // drawn winner's turn: no new spin while one is still animating.
    const activeSpin = this.lastSpin();
    if (
      activeSpin !== null &&
      Date.now() < activeSpin.startAt + activeSpin.durationMs
    ) {
      this.reject(ws, undefined, "INVALID", "The wheel is still spinning");
      return;
    }
    let picker = this.picker() ?? EMPTY_PICKER;
    if (picker.current !== null) {
      picker = {
        ...picker,
        presented: [...picker.presented, picker.current],
        current: null,
      };
    }
    if (picker.remaining.length === 0) {
      if (picker.presented.length === 0) {
        this.reject(ws, undefined, "INVALID", "Nobody to pick");
        return;
      }
      // Completing the final presenter — no spin, just the finished state.
      // The round is over, so the whole board goes to everyone, including the
      // cards of people who were excluded or never came online.
      const before = this.revealNow();
      this.savePicker(withAllRevealed(picker));
      this.broadcastAll({
        type: "picker.changed",
        seq: this.nextSeq(),
        picker: withAllRevealed(picker),
      });
      this.broadcastNewlyVisible(before);
      this.setSpotlight(null); // nobody on stage, nothing staged
      return;
    }
    // Draw only among people who are actually here; offline ids stay in
    // remaining as a safety net (disconnects normally remove them already).
    const online = new Set(
      this.sql
        .exec("SELECT id FROM participants WHERE online = 1")
        .toArray()
        .map((row) => String(row.id)),
    );
    const candidates = picker.remaining.filter((id) => online.has(id));
    const pool = candidates.length > 0 ? candidates : [...picker.remaining];
    const winnerId = pool[randomIndex(pool.length)] as string;
    const beforeDraw = this.revealNow();
    picker = withPresenterRevealed(
      {
        ...picker,
        // filter the FULL remaining list — the draw pool may be the online
        // subset, and offline members must stay in the rotation
        remaining: picker.remaining.filter((id) => id !== winnerId),
        current: winnerId,
      },
      winnerId,
    );
    this.savePicker(picker);
    const seedBuf = new Uint32Array(1);
    crypto.getRandomValues(seedBuf);
    const spin: WheelSpin = {
      pool,
      winnerId,
      seed: seedBuf[0] as number,
      startAt: Date.now() + WHEEL_START_DELAY_MS,
      durationMs: WHEEL_SPIN_MS,
    };
    // Persisted for the in-flight guard above and so reconnect syncs can
    // resume the animation instead of killing the wheel mid-spin.
    this.setMeta("lastSpin", JSON.stringify(spin));
    this.broadcastAll({
      type: "picker.spun",
      seq: this.nextSeq(),
      picker,
      ...spin,
    });
    // AFTER the spin frame on purpose: the winner's cards land behind the
    // wheel overlay, so they are already there when it lifts. This leaks
    // nothing early — picker.spun names the winner in plaintext anyway.
    this.broadcastNewlyVisible(beforeDraw);
    // LAST, and the order matters: the spotlight names a card, so it must
    // never precede the frame that hands the recipient that card.
    this.seedSpotlight(winnerId);
  }

  private handlePickerSkip(ws: WebSocket, participant: ParticipantRow): void {
    if (participant.role !== "facilitator") {
      this.reject(
        ws,
        undefined,
        "NOT_ADMIN",
        "Only the facilitator manages the wheel",
      );
      return;
    }
    const picker = this.picker();
    if (picker === null || picker.current === null) {
      this.reject(ws, undefined, "INVALID", "Nobody is presenting");
      return;
    }
    const updated: PickerState = {
      ...picker,
      remaining: [...picker.remaining, picker.current],
      current: null,
    };
    this.savePicker(updated);
    this.broadcastAll({
      type: "picker.changed",
      seq: this.nextSeq(),
      picker: updated,
    });
    this.setSpotlight(null); // nobody holds the mic any more
  }

  // Facilitator hand-picks the next presenter directly (no wheel). Same
  // rotation bookkeeping as a spin: auto-complete whoever is up, then put the
  // chosen (remaining) person on stage.
  private handlePickerPick(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "admin.picker.pick" }>,
  ): void {
    if (participant.role !== "facilitator") {
      this.reject(ws, undefined, "NOT_ADMIN", "Only the facilitator picks");
      return;
    }
    if (this.phase() !== "present") {
      this.reject(
        ws,
        undefined,
        "PHASE_LOCKED",
        "Presenters are picked in the presenting phase",
      );
      return;
    }
    // Don't yank the stage out from under an animating wheel.
    const activeSpin = this.lastSpin();
    if (
      activeSpin !== null &&
      Date.now() < activeSpin.startAt + activeSpin.durationMs
    ) {
      this.reject(ws, undefined, "INVALID", "The wheel is still spinning");
      return;
    }
    let picker = this.picker() ?? EMPTY_PICKER;
    if (!picker.remaining.includes(cmd.participantId)) {
      this.reject(ws, undefined, "INVALID", "That person is not up next");
      return;
    }
    if (picker.current !== null) {
      picker = {
        ...picker,
        presented: [...picker.presented, picker.current],
        current: null,
      };
    }
    const before = this.revealNow();
    picker = withPresenterRevealed(
      {
        ...picker,
        remaining: picker.remaining.filter((id) => id !== cmd.participantId),
        current: cmd.participantId,
      },
      cmd.participantId,
    );
    this.savePicker(picker);
    this.broadcastAll({
      type: "picker.changed",
      seq: this.nextSeq(),
      picker,
    });
    // Taking the stage is what hands this person's cards to the room.
    this.broadcastNewlyVisible(before);
    this.seedSpotlight(cmd.participantId);
  }

  // The person on stage marks their own turn done (member OR facilitator).
  // A stale click (the facilitator already advanced) fails the sender===current
  // check and rejects — the client resyncs off that.
  private handlePickerDone(ws: WebSocket, participant: ParticipantRow): void {
    if (this.phase() !== "present") {
      this.reject(
        ws,
        undefined,
        "PHASE_LOCKED",
        "The presenting round is not active",
      );
      return;
    }
    const picker = this.picker();
    if (picker === null || picker.current === null) {
      this.reject(ws, undefined, "INVALID", "Nobody is presenting");
      return;
    }
    if (picker.current !== participant.id) {
      this.reject(ws, undefined, "INVALID", "You are not the one presenting");
      return;
    }
    const before = this.revealNow();
    const stepped: PickerState = {
      ...picker,
      presented: [...picker.presented, picker.current],
      current: null,
    };
    // The last person stepping off ends the round: the rest of the board goes
    // to everyone, exactly as the facilitator's "finish round" spin does.
    const updated = rotationExhausted(stepped)
      ? withAllRevealed(stepped)
      : stepped;
    this.savePicker(updated);
    this.broadcastAll({
      type: "picker.changed",
      seq: this.nextSeq(),
      picker: updated,
    });
    this.broadcastNewlyVisible(before);
    this.setSpotlight(null);
  }

  private handlePickerPool(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<
      ClientCommand,
      { type: "admin.picker.exclude" | "admin.picker.include" }
    >,
  ): void {
    if (participant.role !== "facilitator") {
      this.reject(
        ws,
        undefined,
        "NOT_ADMIN",
        "Only the facilitator manages the wheel",
      );
      return;
    }
    const picker = this.picker();
    if (picker === null) {
      this.reject(ws, undefined, "INVALID", "The wheel is not set up yet");
      return;
    }
    const before = this.revealNow();
    let updated: PickerState;
    if (cmd.type === "admin.picker.exclude") {
      if (!picker.remaining.includes(cmd.participantId)) return; // nothing to do
      updated = {
        ...picker,
        remaining: picker.remaining.filter((id) => id !== cmd.participantId),
        // remembered so reconnects/latecomer auto-adds cannot undo it
        excluded: [...picker.excluded, cmd.participantId],
      };
    } else {
      if (this.participantById(cmd.participantId) === null) return;
      if (picker.excluded.includes(cmd.participantId)) {
        updated = {
          ...picker,
          remaining: [...picker.remaining, cmd.participantId],
          excluded: picker.excluded.filter((id) => id !== cmd.participantId),
        };
      } else if (!pickerKnows(picker, cmd.participantId)) {
        updated = {
          ...picker,
          remaining: [...picker.remaining, cmd.participantId],
        };
      } else {
        return; // already in the rotation
      }
    }
    // Excluding the last person waiting ends the round — otherwise a room whose
    // facilitator took everyone off the wheel would sit on a board nobody but
    // the facilitator can read. `include` can only ever add someone to the
    // pool, so it never narrows what has already been shown.
    if (rotationExhausted(updated)) updated = withAllRevealed(updated);
    this.savePicker(updated);
    this.broadcastAll({
      type: "picker.changed",
      seq: this.nextSeq(),
      picker: updated,
    });
    this.broadcastNewlyVisible(before);
  }

  private handleRoleSet(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "admin.role.set" }>,
  ): void {
    if (participant.role !== "facilitator") {
      this.reject(
        ws,
        undefined,
        "NOT_ADMIN",
        "Only a facilitator assigns roles",
      );
      return;
    }
    const target = this.participantById(cmd.participantId);
    if (target === null) {
      this.reject(ws, undefined, "NOT_FOUND", "Participant does not exist");
      return;
    }
    if (target.role === cmd.role) return; // no-op
    if (cmd.role === "member") {
      const facilitators = Number(
        this.sql
          .exec(
            "SELECT COUNT(*) AS n FROM participants WHERE role = 'facilitator'",
          )
          .toArray()[0]?.n ?? 0,
      );
      if (facilitators <= 1) {
        this.reject(
          ws,
          undefined,
          "INVALID",
          "The board needs at least one facilitator",
        );
        return;
      }
    }
    // The demoted flag makes the decision stick across reconnects even for
    // the admin-token holder (handleJoin checks it before upgrading).
    this.sql.exec(
      "UPDATE participants SET role = ?, demoted = ? WHERE id = ?",
      cmd.role,
      cmd.role === "member" ? 1 : 0,
      target.id,
    );
    const updated = this.participantById(target.id);
    if (updated === null) return;
    this.broadcastAll({
      type: "roster.updated",
      seq: this.nextSeq(),
      participant: rowToParticipant(updated),
    });
    // A role change moves this person across the visibility boundary in one
    // direction or the other: a promotion hands them the cards nobody has
    // presented yet (and any staged column), a demotion takes them away. There
    // is no un-reveal event, and the delta helper resolves a recipient's role
    // from the row it has just changed — so both directions are settled the
    // same way, by pushing that participant a fresh snapshot. The reducer
    // replaces state wholesale on sync, so the re-scoped board takes over.
    for (const socket of this.ctx.getWebSockets()) {
      if (readAttachment(socket)?.participantId === target.id) {
        this.send(socket, this.buildSync(updated, updated.session_key));
      }
    }
  }

  // ---------------------------------------------------------------------
  // voting, discussion & actions
  // ---------------------------------------------------------------------

  private handleVoteCast(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "vote.cast" }>,
  ): void {
    if (this.phase() !== "vote") {
      this.reject(ws, cmd.opId, "PHASE_LOCKED", "Voting is not open");
      return;
    }
    // A member cannot vote on a note in a column hidden from them — it's
    // invisible, so answer like a nonexistent target (hidden notes are excluded
    // from tallies anyway; this stops a modified client spending budget there).
    // This runs BEFORE the votable classification: the "vote the stack, not a
    // stacked note" reject is otherwise an oracle that tells a member a guessed
    // id names a note inside a staged column, and which of them is the anchor.
    if (participant.role !== "facilitator") {
      const columnId = this.noteRowById(cmd.targetId)?.column_id ?? null;
      if (columnId !== null && this.hiddenColumnIds().has(columnId)) {
        this.reject(ws, cmd.opId, "NOT_FOUND", "Nothing to vote on");
        return;
      }
    }
    // Votables are ungrouped notes and stacks (group ids).
    const kind = this.votableKind(cmd.targetId);
    if (kind === "grouped-note") {
      this.reject(
        ws,
        cmd.opId,
        "INVALID",
        "Vote the stack, not a stacked note",
      );
      return;
    }
    if (kind === null) {
      this.reject(ws, cmd.opId, "NOT_FOUND", "Nothing to vote on");
      return;
    }
    const config = this.config();
    const current = Number(
      this.sql
        .exec(
          "SELECT count FROM votes WHERE target_id = ? AND participant_id = ?",
          cmd.targetId,
          participant.id,
        )
        .toArray()[0]?.count ?? 0,
    );
    const total = Number(
      this.sql
        .exec(
          "SELECT COALESCE(SUM(count), 0) AS total FROM votes WHERE participant_id = ?",
          participant.id,
        )
        .toArray()[0]?.total ?? 0,
    );
    // Absolute where the client sends it, relative for a tab still running the
    // previous build. The absolute form is what makes a resend after reconnect
    // safe — replaying a delta would double-count.
    const next = cmd.count ?? current + (cmd.delta ?? 0);
    if (next < 0) {
      this.reject(ws, cmd.opId, "INVALID", "No vote to remove");
      return;
    }
    if (next === current) {
      this.ack(ws, cmd.opId); // idempotent resend of an applied cast
      return;
    }
    const raising = next > current;
    // Budgets bind only when spending MORE. A config lowered mid-round can
    // leave a voter over budget; they must still be able to take dots off.
    if (raising && total - current + next > config.votesPerPerson) {
      this.reject(ws, cmd.opId, "VOTE_BUDGET", "All votes used");
      return;
    }
    if (raising && config.maxPerTarget !== null && next > config.maxPerTarget) {
      this.reject(
        ws,
        cmd.opId,
        "VOTE_BUDGET",
        "Vote limit for this card reached",
      );
      return;
    }
    if (next === 0) {
      this.sql.exec(
        "DELETE FROM votes WHERE target_id = ? AND participant_id = ?",
        cmd.targetId,
        participant.id,
      );
    } else {
      this.sql.exec(
        `INSERT INTO votes (target_id, participant_id, count) VALUES (?, ?, ?)
         ON CONFLICT(target_id, participant_id) DO UPDATE SET count = excluded.count`,
        cmd.targetId,
        participant.id,
        next,
      );
    }
    this.ack(ws, cmd.opId);
    // Blind voting: the caster (all their tabs) learns only their own votes;
    // everyone else sees just the anonymous progress meter.
    this.sendProgressTo(participant.id);
    this.broadcastMeter();
  }

  private handleVoteConfig(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "admin.vote.config" }>,
  ): void {
    if (participant.role !== "facilitator") {
      this.reject(
        ws,
        undefined,
        "NOT_ADMIN",
        "Only the facilitator configures voting",
      );
      return;
    }
    if (this.phase() === "done") {
      this.reject(ws, undefined, "PHASE_LOCKED", "The retro is finished");
      return;
    }
    this.setMeta("votesPerPerson", String(cmd.votesPerPerson));
    this.setMeta(
      "maxPerTarget",
      cmd.maxPerTarget === null ? "" : String(cmd.maxPerTarget),
    );
    this.setMeta("topN", String(cmd.topN));
    this.broadcastAll({
      type: "config.changed",
      seq: this.nextSeq(),
      config: this.config(),
    });
    const phase = this.phase();
    if (phase === "vote") {
      // Lowering a limit mid-vote trims existing over-budget votes and tells
      // affected voters their new own-vote state.
      this.clampVotesToConfig();
      this.broadcastAllProgress();
      this.broadcastMeter(true);
    } else if (phase === "discuss" || phase === "close") {
      // Changing topN after the reveal re-crowns; keep connected clients in
      // step with what a reconnecting client would compute.
      const { tallies, topTargetIds, voters } = this.talliesAndTop();
      this.broadcastAll({
        type: "votes.revealed",
        seq: this.nextSeq(),
        tallies,
        topTargetIds,
        voters,
      });
    }
  }

  private handleDiscussFocus(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "admin.discuss.focus" }>,
  ): void {
    if (participant.role !== "facilitator") {
      this.reject(
        ws,
        undefined,
        "NOT_ADMIN",
        "Only the facilitator steers the discussion",
      );
      return;
    }
    if (this.phase() !== "discuss") {
      this.reject(
        ws,
        undefined,
        "PHASE_LOCKED",
        "Focus works in the discussion phase",
      );
      return;
    }
    // Only whole votables can be focused: an ungrouped note or a stack — a
    // buried stacked-note id (or unknown id) is not a discussion target.
    if (cmd.targetId !== null) {
      const kind = this.votableKind(cmd.targetId);
      if (kind !== "note" && kind !== "group") {
        this.reject(ws, undefined, "NOT_FOUND", "Nothing to focus");
        return;
      }
      // A hidden-column note must never become the shared discussion focus —
      // its id would broadcast to members (and ride in every sync), leaking a
      // staged note. Same exclusion talliesAndTop applies to crowns.
      const columnId = this.noteRowById(cmd.targetId)?.column_id ?? null;
      if (columnId !== null && this.hiddenColumnIds().has(columnId)) {
        this.reject(ws, undefined, "NOT_FOUND", "Nothing to focus");
        return;
      }
    }
    if (cmd.targetId === null)
      this.sql.exec("DELETE FROM board_meta WHERE key = 'discussFocus'");
    else this.setMeta("discussFocus", cmd.targetId);
    this.broadcastAll({
      type: "discuss.focus",
      seq: this.nextSeq(),
      targetId: cmd.targetId,
    });
  }

  private handleAction(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<
      ClientCommand,
      { type: "action.create" | "action.update" | "action.delete" }
    >,
  ): void {
    const phase = this.phase();
    // Action items crystallize while discussing; the whole team may capture
    // and edit them (small-team trust model).
    if (phase !== "discuss" && phase !== "close") {
      this.reject(
        ws,
        cmd.opId,
        "PHASE_LOCKED",
        "Actions are captured while discussing",
      );
      return;
    }
    if (cmd.type === "action.create") {
      if (this.actionById(cmd.actionId) !== null) {
        this.ack(ws, cmd.opId); // idempotent retry
        return;
      }
      if (cmd.ownerId !== null && this.participantById(cmd.ownerId) === null) {
        this.reject(ws, cmd.opId, "NOT_FOUND", "Owner does not exist");
        return;
      }
      this.sql.exec(
        "INSERT INTO actions (id, text, owner_id, status, created_at) VALUES (?, ?, ?, 'open', ?)",
        cmd.actionId,
        cmd.text,
        cmd.ownerId,
        Date.now(),
      );
      const action = this.actionById(cmd.actionId);
      if (action === null) return;
      const seq = this.nextSeq();
      this.ack(ws, cmd.opId, seq);
      this.broadcastAll({ type: "action.created", seq, action });
      return;
    }
    const existing = this.actionById(cmd.actionId);
    if (cmd.type === "action.delete") {
      if (existing === null) {
        this.ack(ws, cmd.opId); // idempotent
        return;
      }
      this.sql.exec("DELETE FROM actions WHERE id = ?", cmd.actionId);
      const seq = this.nextSeq();
      this.ack(ws, cmd.opId, seq);
      this.broadcastAll({
        type: "action.deleted",
        seq,
        actionId: cmd.actionId,
      });
      return;
    }
    if (existing === null) {
      this.reject(ws, cmd.opId, "NOT_FOUND", "Action does not exist");
      return;
    }
    if (
      cmd.ownerId !== undefined &&
      cmd.ownerId !== null &&
      this.participantById(cmd.ownerId) === null
    ) {
      this.reject(ws, cmd.opId, "NOT_FOUND", "Owner does not exist");
      return;
    }
    this.sql.exec(
      "UPDATE actions SET text = ?, owner_id = ?, status = ? WHERE id = ?",
      cmd.text ?? existing.text,
      cmd.ownerId === undefined ? existing.ownerId : cmd.ownerId,
      cmd.status ?? existing.status,
      cmd.actionId,
    );
    const action = this.actionById(cmd.actionId);
    if (action === null) return;
    const seq = this.nextSeq();
    this.ack(ws, cmd.opId, seq);
    this.broadcastAll({ type: "action.updated", seq, action });
  }

  /** "note" for ungrouped notes, "group" for stack ids, "grouped-note" for
   *  members of a stack, null for unknown ids. */
  private votableKind(
    targetId: string,
  ): "note" | "group" | "grouped-note" | null {
    // Group check FIRST: a stack's id equals its anchor member's note id, and
    // that id must resolve to the stack, not to the buried note.
    const members = this.sql
      .exec("SELECT COUNT(*) AS n FROM notes WHERE group_id = ?", targetId)
      .toArray()[0];
    if (Number(members?.n ?? 0) > 0) return "group";
    const note = this.noteRowById(targetId);
    if (note !== null) return note.group_id === null ? "note" : "grouped-note";
    return null;
  }

  private myVotes(participantId: string): Record<string, number> {
    const mine: Record<string, number> = {};
    for (const row of this.sql
      .exec(
        "SELECT target_id, count FROM votes WHERE participant_id = ?",
        participantId,
      )
      .toArray()) {
      mine[String(row.target_id)] = Number(row.count);
    }
    return mine;
  }

  private meter(): { votersDone: number; votersTotal: number } {
    const budget = this.config().votesPerPerson;
    const online = this.sql
      .exec("SELECT id FROM participants WHERE online = 1")
      .toArray()
      .map((row) => String(row.id));
    // One grouped pass over `votes` instead of one SUM per online participant:
    // this runs on every cast, join and disconnect during the vote phase, and
    // `votes` has no index on participant_id, so the per-person form was a
    // full scan each time.
    const spent = new Map<string, number>();
    for (const row of this.sql
      .exec(
        "SELECT participant_id, SUM(count) AS total FROM votes GROUP BY participant_id",
      )
      .toArray()) {
      spent.set(String(row.participant_id), Number(row.total ?? 0));
    }
    let votersDone = 0;
    for (const id of online) {
      if ((spent.get(id) ?? 0) >= budget) votersDone++;
    }
    return { votersDone, votersTotal: online.length };
  }

  /** Blind rule: tallies and crowns appear in snapshots only once the board
   *  moved PAST the vote phase. */
  private votesForSync(
    participantId: string,
    phase: Phase,
  ): {
    mine: Record<string, number>;
    votersDone: number;
    votersTotal: number;
    tallies: Record<string, number> | null;
    topTargetIds: string[];
    voters: Record<string, Record<string, number>> | null;
  } {
    const revealedTallies =
      phase === "discuss" || phase === "close" || phase === "done"
        ? this.talliesAndTop()
        : null;
    return {
      mine: this.myVotes(participantId),
      ...this.meter(),
      tallies: revealedTallies?.tallies ?? null,
      topTargetIds: revealedTallies?.topTargetIds ?? [],
      // The same phase gate carries the voter map: before the reveal it is
      // null for everyone, which is what keeps the vote itself blind.
      voters: revealedTallies?.voters ?? null,
    };
  }

  // Changed-only: broadcasting the meter on EVERY cast would leak the exact
  // timing and count of everyone's dots (a side-channel far finer than the
  // "who finished their budget" signal the meter is meant to be).
  private broadcastMeter(force = false): void {
    if (this.phase() !== "vote") return;
    const meter = this.meter();
    const key = `${meter.votersDone}/${meter.votersTotal}`;
    if (!force && this.getMeta("meterState") === key) return;
    this.setMeta("meterState", key);
    this.broadcastAll({ type: "vote.meter", seq: this.nextSeq(), ...meter });
  }

  /** Fresh own-votes to EVERY socket of a participant — a second tab (or a
   *  projector view) must not show a stale budget after a cast. */
  private sendProgressTo(participantId: string): void {
    const frame = JSON.stringify({
      type: "vote.progress",
      yourVotes: this.myVotes(participantId),
    });
    for (const ws of this.ctx.getWebSockets()) {
      if (readAttachment(ws)?.participantId === participantId) {
        this.trySend(ws, frame);
      }
    }
  }

  /** The caster's own ROTI score to EVERY socket of that participant — a
   *  second tab (or projector view) must not show a stale selection. Mirrors
   *  sendProgressTo; the individual score never reaches any other participant. */
  private sendRotiYouTo(participantId: string, score: number): void {
    const frame = JSON.stringify({ type: "roti.you", yourScore: score });
    for (const ws of this.ctx.getWebSockets()) {
      if (readAttachment(ws)?.participantId === participantId) {
        this.trySend(ws, frame);
      }
    }
  }

  /** Every joined participant gets their own fresh votes — after a structural
   *  change (delete, vote migration) that may have rewritten vote rows. */
  private broadcastAllProgress(): void {
    const seen = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const id = readAttachment(ws)?.participantId ?? null;
      if (id === null || seen.has(id)) continue;
      seen.add(id);
      this.sendProgressTo(id);
    }
  }

  // Structural changes (note/column delete, vote migration) can strand
  // clients with stale own-votes, a stale meter, dead crowns, or a dangling
  // discussion focus. This re-syncs whatever the current phase surfaces.
  private reconcileAfterVoteMutation(): void {
    const phase = this.phase();
    if (phase === "vote") {
      this.broadcastAllProgress();
      this.broadcastMeter();
      return;
    }
    if (phase === "discuss" || phase === "close") {
      const focus = this.getMeta("discussFocus");
      const focusKind = focus === null ? null : this.votableKind(focus);
      if (focus !== null && focusKind !== "note" && focusKind !== "group") {
        this.sql.exec("DELETE FROM board_meta WHERE key = 'discussFocus'");
        this.broadcastAll({
          type: "discuss.focus",
          seq: this.nextSeq(),
          targetId: null,
        });
      }
      const { tallies, topTargetIds, voters } = this.talliesAndTop();
      this.broadcastAll({
        type: "votes.revealed",
        seq: this.nextSeq(),
        tallies,
        topTargetIds,
        voters,
      });
    }
  }

  // Trims existing votes to the current config after the facilitator lowers a
  // limit mid-vote, so early voters don't keep more influence than the new
  // budget/cap allows. Per-target first, then per-person (highest rows go).
  private clampVotesToConfig(): void {
    const config = this.config();
    if (config.maxPerTarget !== null) {
      this.sql.exec(
        "UPDATE votes SET count = ? WHERE count > ?",
        config.maxPerTarget,
        config.maxPerTarget,
      );
    }
    const overs = this.sql
      .exec(
        "SELECT participant_id, SUM(count) AS total FROM votes GROUP BY participant_id HAVING total > ?",
        config.votesPerPerson,
      )
      .toArray();
    for (const row of overs) {
      const pid = String(row.participant_id);
      let excess = Number(row.total) - config.votesPerPerson;
      while (excess > 0) {
        const top = this.sql
          .exec(
            "SELECT target_id, count FROM votes WHERE participant_id = ? ORDER BY count DESC, target_id ASC LIMIT 1",
            pid,
          )
          .toArray()[0];
        if (top === undefined) break;
        const targetId = String(top.target_id);
        const remove = Math.min(excess, Number(top.count));
        const nextCount = Number(top.count) - remove;
        if (nextCount <= 0) {
          this.sql.exec(
            "DELETE FROM votes WHERE target_id = ? AND participant_id = ?",
            targetId,
            pid,
          );
        } else {
          this.sql.exec(
            "UPDATE votes SET count = ? WHERE target_id = ? AND participant_id = ?",
            nextCount,
            targetId,
            pid,
          );
        }
        excess -= remove;
      }
    }
  }

  /** True only when the room is meant to see WHO voted. Consulted in exactly
   *  one place (talliesAndTop) so every emitter — the phase reveal, the
   *  re-crown, the reconcile, the sync snapshot and the export — inherits it
   *  rather than each re-deriving the rule. Anonymity wins over the flag: a
   *  board that strips note authorship must not hand names back through the
   *  vote surface. */
  private voterNamesShown(): boolean {
    return this.config().voterNamesEnabled && !this.anonymous();
  }

  /** Tallies over CURRENT votables only (dangling vote rows are ignored),
   *  top-N with a stable tiebreak (count desc, id asc). `voters` is the same
   *  data one level finer, and null whenever the board is blind. */
  private talliesAndTop(): {
    tallies: Record<string, number>;
    topTargetIds: string[];
    voters: Record<string, Record<string, number>> | null;
  } {
    // Notes in hidden (staged) columns are excluded from the votable set:
    // revealed tallies/crowns are broadcast to EVERYONE, so a hidden note's id
    // or count must never surface there. Reveal restores them to the tally.
    const votable = new Set<string>();
    for (const row of this.sql
      .exec(
        "SELECT n.id, n.group_id FROM notes n JOIN columns c ON c.id = n.column_id WHERE c.hidden = 0",
      )
      .toArray()) {
      if (row.group_id === null) votable.add(String(row.id));
      else votable.add(String(row.group_id));
    }
    // One pass over the raw rows builds BOTH maps. The GROUP BY it replaces
    // already scanned every row, so this is rows-read neutral — and it is why
    // the voter map costs no second query.
    const showVoters = this.voterNamesShown();
    const tallies: Record<string, number> = {};
    const voters: Record<string, Record<string, number>> = {};
    for (const row of this.sql
      .exec("SELECT target_id, participant_id, count FROM votes")
      .toArray()) {
      const id = String(row.target_id);
      // The SAME votable filter, which is what keeps a note inside a staged
      // (hidden) column out of the voter map: this reveal is broadcast to
      // everyone, so a hidden note's id must never appear in it.
      if (!votable.has(id)) continue;
      const count = Number(row.count);
      tallies[id] = (tallies[id] ?? 0) + count;
      if (showVoters) {
        (voters[id] ??= {})[String(row.participant_id)] = count;
      }
    }
    const topTargetIds = Object.entries(tallies)
      .sort(([idA, a], [idB, b]) => b - a || idA.localeCompare(idB))
      .slice(0, this.config().topN)
      .map(([id]) => id);
    return { tallies, topTargetIds, voters: showVoters ? voters : null };
  }

  private migrateVotes(from: string, to: string): void {
    this.sql.exec(
      `INSERT INTO votes (target_id, participant_id, count)
         SELECT ?, participant_id, count FROM votes WHERE target_id = ?
       ON CONFLICT(target_id, participant_id) DO UPDATE SET count = count + excluded.count`,
      to,
      from,
    );
    this.sql.exec("DELETE FROM votes WHERE target_id = ?", from);
    // Merging two targets can push a voter's count on the survivor above the
    // per-target cap — clamp it back (refunding the overflow to their budget).
    const cap = this.config().maxPerTarget;
    if (cap !== null) {
      this.sql.exec(
        "UPDATE votes SET count = ? WHERE target_id = ? AND count > ?",
        cap,
        to,
        cap,
      );
    }
  }

  private actionById(id: string): Action | null {
    const row = this.sql
      .exec("SELECT * FROM actions WHERE id = ?", id)
      .toArray()[0];
    if (row === undefined) return null;
    return {
      id: String(row.id),
      text: String(row.text),
      ownerId: row.owner_id === null ? null : String(row.owner_id),
      status: row.status === "done" ? "done" : "open",
    };
  }

  private actions(): Action[] {
    return this.sql
      .exec("SELECT * FROM actions ORDER BY created_at")
      .toArray()
      .map((row) => ({
        id: String(row.id),
        text: String(row.text),
        ownerId: row.owner_id === null ? null : String(row.owner_id),
        status: row.status === "done" ? ("done" as const) : ("open" as const),
      }));
  }

  // ---------------------------------------------------------------------
  // appreciation wall, GIFs & retention
  // ---------------------------------------------------------------------

  private handleKudoCreate(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "kudo.create" }>,
  ): void {
    if (this.phase() !== "close") {
      this.reject(
        ws,
        cmd.opId,
        "PHASE_LOCKED",
        "Kudos are shared in the close phase",
      );
      return;
    }
    // "Thanks to all" is addressed to the room, not to a roster row — the
    // sentinel is never a participant id (those are 32-char hex), so it can
    // never name a real person by accident. An unknown id is still refused:
    // the existence check moves INTO this branch, it is not replaced by it.
    if (cmd.toId !== KUDO_EVERYONE) {
      if (this.participantById(cmd.toId) === null) {
        this.reject(ws, cmd.opId, "NOT_FOUND", "Recipient does not exist");
        return;
      }
      // Appreciation is for other people. The composer already leaves the
      // sender out of the picker, so a normal client never gets here — but the
      // rule is the server's, not the picker's. A kudo to EVERYONE is fine:
      // "thanks to all" includes you the way any toast does, and refusing it
      // would make a solo board unable to say thank you at all.
      if (cmd.toId === participant.id) {
        this.reject(ws, cmd.opId, "INVALID", "Kudos go to someone else");
        return;
      }
    }
    if (this.kudoRowById(cmd.kudoId) !== null) {
      this.ack(ws, cmd.opId); // idempotent retry
      return;
    }
    // The sender is recorded server-side only if they chose to be shown —
    // anonymous kudos never carry the sender id on the wire.
    const fromId = cmd.anonymous ? null : participant.id;
    this.sql.exec(
      "INSERT INTO kudos (id, card_type, to_id, from_id, text, gif_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      cmd.kudoId,
      cmd.cardType,
      cmd.toId,
      fromId,
      cmd.text,
      this.sanitizeGifUrl(cmd.gifUrl) ?? null,
      Date.now(),
    );
    const kudo = this.kudoById(cmd.kudoId);
    if (kudo === null) return;
    const seq = this.nextSeq();
    this.ack(ws, cmd.opId, seq);
    this.broadcastAll({ type: "kudo.created", seq, kudo });
  }

  private handleKudoDelete(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "kudo.delete" }>,
  ): void {
    if (this.phase() !== "close") {
      this.reject(
        ws,
        cmd.opId,
        "PHASE_LOCKED",
        "The appreciation wall is closed",
      );
      return;
    }
    const row = this.kudoRowById(cmd.kudoId);
    if (row === null) {
      this.ack(ws, cmd.opId); // idempotent
      return;
    }
    // Sender (if known) or a facilitator may remove a kudo.
    const isAdmin = participant.role === "facilitator";
    if (row.from_id !== participant.id && !isAdmin) {
      this.reject(
        ws,
        cmd.opId,
        "NOT_AUTHOR",
        "Only the sender or facilitator can remove this",
      );
      return;
    }
    this.sql.exec("DELETE FROM kudos WHERE id = ?", cmd.kudoId);
    const seq = this.nextSeq();
    this.ack(ws, cmd.opId, seq);
    this.broadcastAll({ type: "kudo.deleted", seq, kudoId: cmd.kudoId });
  }

  private handleGifsSet(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "admin.gifs.set" }>,
  ): void {
    if (participant.role !== "facilitator") {
      this.reject(
        ws,
        undefined,
        "NOT_ADMIN",
        "Only the facilitator changes settings",
      );
      return;
    }
    this.setMeta("gifsEnabled", cmd.enabled ? "1" : "0");
    this.broadcastAll({
      type: "config.changed",
      seq: this.nextSeq(),
      config: this.config(),
    });
  }

  // Whether the post-vote reveal names the voters. Three refusals, and each
  // one is the point of the feature rather than defensive noise:
  //  - members cannot set it;
  //  - an anonymous board cannot, at all: it promised to strip authorship, and
  //    a named voter list on a small board hands that back through the side
  //    door;
  //  - and it is LOCKED once voting has closed. Flipping it on in `discuss`
  //    would de-blind a round people already voted in believing it was secret,
  //    with no way for them to take a dot back. That is the failure mode this
  //    whole feature has to be built around, so it is refused at the door.
  private handleVoterNamesSet(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "admin.voterNames.set" }>,
  ): void {
    if (participant.role !== "facilitator") {
      this.reject(
        ws,
        undefined,
        "NOT_ADMIN",
        "Only the facilitator changes settings",
      );
      return;
    }
    if (cmd.enabled && this.anonymous()) {
      this.reject(
        ws,
        undefined,
        "INVALID",
        "This board is anonymous — votes stay unattributed",
      );
      return;
    }
    const phase = this.phase();
    const revealed =
      phase === "discuss" || phase === "close" || phase === "done";
    // Any dot already cast freezes the setting too, not just the reveal: the
    // vote bar tells people whether their name will be attached BEFORE they
    // spend anything, and flipping it on mid-round would attribute dots cast
    // under the opposite promise — with no way to take one back.
    const alreadyVoted =
      Number(
        this.sql.exec("SELECT COUNT(*) AS n FROM votes").toArray()[0]?.n ?? 0,
      ) > 0;
    // The lock is ONE-WAY. Turning names ON is refused once anyone has voted.
    // Turning them OFF is always allowed — withdrawing is strictly
    // privacy-improving, and a facilitator who realises mid-discussion that the
    // room is uncomfortable must be able to take the names down.
    if ((revealed || alreadyVoted) && cmd.enabled) {
      this.reject(
        ws,
        undefined,
        "PHASE_LOCKED",
        "Voting has started — names cannot be turned on now",
      );
      return;
    }
    this.setMeta("voterNamesEnabled", cmd.enabled ? "1" : "0");
    this.broadcastAll({
      type: "config.changed",
      seq: this.nextSeq(),
      config: this.config(),
    });
    // Names already on screen have to come down without a reload, so the
    // reveal is re-broadcast with the recomputed (now null) map.
    if (revealed) {
      const { tallies, topTargetIds, voters } = this.talliesAndTop();
      this.broadcastAll({
        type: "votes.revealed",
        seq: this.nextSeq(),
        tallies,
        topTargetIds,
        voters,
      });
    }
  }

  // The render switch. Deliberately does NOT touch what the server sends: there
  // is no un-reveal event, and "nothing the room has already read may be taken
  // back" is the invariant the whole presenting round is built on. Hiding is a
  // property of the screen, so flipping it off restores the board instantly
  // with no re-reveal burst.
  private handleFocusSet(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "admin.focus.set" }>,
  ): void {
    if (participant.role !== "facilitator") {
      this.reject(
        ws,
        undefined,
        "NOT_ADMIN",
        "Only the facilitator changes settings",
      );
      return;
    }
    this.setMeta("focusMode", cmd.enabled ? "1" : "0");
    this.broadcastAll({
      type: "config.changed",
      seq: this.nextSeq(),
      config: this.config(),
    });
  }

  // Move the stage to one of the presenter's cards. Every guard is a rule the
  // feature is made of, and the ROLE check comes first because that is what the
  // authorization matrix asserts for every admin.* command.
  private handleSpotlightSet(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "admin.spotlight.set" }>,
  ): void {
    if (participant.role !== "facilitator") {
      this.reject(
        ws,
        undefined,
        "NOT_ADMIN",
        "Only the facilitator drives the walkthrough",
      );
      return;
    }
    if (this.phase() !== "present") {
      this.reject(
        ws,
        undefined,
        "PHASE_LOCKED",
        "The walkthrough runs in the presenting phase",
      );
      return;
    }
    if (!this.spotlightAllowed()) {
      this.reject(
        ws,
        undefined,
        "INVALID",
        "This board is anonymous — cards are not walked per person",
      );
      return;
    }
    if (cmd.targetId === null) {
      this.setSpotlight(null);
      return;
    }
    const note = this.noteById(cmd.targetId);
    if (note === null) {
      this.reject(ws, undefined, "NOT_FOUND", "No such card");
      return;
    }
    // A staged column's cards are the facilitator's alone. Putting one on a
    // stage the whole room is watching would hand out its id — the same reason
    // the discussion focus refuses a hidden target.
    if (this.hiddenColumnIds().has(note.columnId)) {
      this.reject(ws, undefined, "NOT_FOUND", "No such card");
      return;
    }
    // Only the CURRENT presenter's cards. Anything else would stage a card the
    // rotation has not reached, which is exactly what the round paces.
    const picker = this.picker();
    if (picker === null || picker.current === null) {
      this.reject(ws, undefined, "INVALID", "Nobody is presenting");
      return;
    }
    if (note.authorId !== picker.current) {
      this.reject(ws, undefined, "INVALID", "That card is not on stage");
      return;
    }
    this.setSpotlight(cmd.targetId);
  }

  private handleCursorsSet(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "admin.cursors.set" }>,
  ): void {
    if (participant.role !== "facilitator") {
      this.reject(
        ws,
        undefined,
        "NOT_ADMIN",
        "Only the facilitator changes settings",
      );
      return;
    }
    // Emergency kill switch. Normally true because the 1 Hz client throttle
    // and the account-wide daily lease budget protect the Free tier.
    if (cmd.enabled && !CURSORS_ACTIVATABLE) {
      this.reject(
        ws,
        undefined,
        "INVALID",
        "Live cursors are not available yet",
      );
      return;
    }
    const blockedUntil = Number(
      this.getMeta("cursorBudgetBlockedUntil") ?? "0",
    );
    if (cmd.enabled && blockedUntil > Date.now()) {
      this.send(ws, {
        type: "error",
        code: "CURSOR_BUDGET",
        message: "Daily live cursor budget reached",
      });
      return;
    }
    if (cmd.enabled && blockedUntil !== 0) {
      this.sql.exec(
        "DELETE FROM board_meta WHERE key = 'cursorBudgetBlockedUntil'",
      );
    }
    this.setMeta("cursorsEnabled", cmd.enabled ? "1" : "0");
    this.broadcastAll({
      type: "config.changed",
      seq: this.nextSeq(),
      config: this.config(),
    });
  }

  // Fire-and-forget cursor presence. Dropped ENTIRELY unless the facilitator
  // enabled cursors (continuous streams would break the free tier) — the gate
  // lives on the server so a rogue client can't stream cursors on a board that
  // opted out. Never persisted; broadcast to everyone but the sender.
  private async handleCursor(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "presence.cursor" }>,
  ): Promise<void> {
    if (this.getMeta("cursorsEnabled") !== "1") return;
    if (this.cursorLease === 0) {
      let lease: DailyBudgetLease;
      try {
        const namespace = this.bindings.RATE_LIMITER;
        const guard = namespace.get(namespace.idFromName("global"));
        lease = await guard.leaseDaily(
          CURSOR_BUDGET_KEY,
          CURSOR_MESSAGE_LEASE_SIZE,
          CURSOR_DAILY_MESSAGE_LIMIT,
        );
      } catch (error) {
        // Fail closed: cursor presence is optional, while notes and votes must
        // retain the account's remaining capacity if the guard is unavailable.
        console.error("[BoardRoom] cursor budget check failed", error);
        this.disableCursorsForBudget(nextUtcResetAt());
        return;
      }
      this.cursorLease = lease.granted;
      if (this.cursorLease === 0) {
        this.disableCursorsForBudget(lease.resetsAt);
        return;
      }
    }
    this.cursorLease -= 1;
    this.broadcastAll(
      {
        type: "presence.cursor",
        participantId: participant.id,
        x: cmd.x,
        y: cmd.y,
      },
      ws,
    );
  }

  private disableCursorsForBudget(resetsAt: number): void {
    if (this.getMeta("cursorsEnabled") !== "1") return;
    this.setMeta("cursorsEnabled", "0");
    this.setMeta("cursorBudgetBlockedUntil", String(resetsAt));
    this.broadcastAll({
      type: "config.changed",
      seq: this.nextSeq(),
      config: this.config(),
    });
    this.broadcastAll({
      type: "error",
      code: "CURSOR_BUDGET",
      message: "Daily live cursor budget reached",
    });
  }

  private handlePickerStyleSet(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "admin.picker.style" }>,
  ): void {
    if (participant.role !== "facilitator") {
      this.reject(
        ws,
        undefined,
        "NOT_ADMIN",
        "Only the facilitator changes settings",
      );
      return;
    }
    // Pure presentation — the draw is unchanged; only the skin clients render.
    this.setMeta("pickerStyle", cmd.style);
    this.broadcastAll({
      type: "config.changed",
      seq: this.nextSeq(),
      config: this.config(),
    });
  }

  private handleLayoutSet(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "admin.layout.set" }>,
  ): void {
    if (participant.role !== "facilitator") {
      this.reject(
        ws,
        undefined,
        "NOT_ADMIN",
        "Only the facilitator changes settings",
      );
      return;
    }
    // Pure presentation over the same zones/notes — no note data changes.
    this.setMeta("layout", cmd.layout);
    this.broadcastAll({
      type: "config.changed",
      seq: this.nextSeq(),
      config: this.config(),
    });
  }

  private async handleBoardKeep(
    ws: WebSocket,
    participant: ParticipantRow,
  ): Promise<void> {
    if (participant.role !== "facilitator") {
      this.reject(
        ws,
        undefined,
        "NOT_ADMIN",
        "Only the facilitator manages retention",
      );
      return;
    }
    this.sql.exec("DELETE FROM board_meta WHERE key = 'retentionAt'");
    await this.rescheduleAlarm();
    this.broadcastAll({
      type: "retention.changed",
      seq: this.nextSeq(),
      retentionAt: null,
    });
  }

  private async handleBoardDelete(
    ws: WebSocket,
    participant: ParticipantRow,
  ): Promise<void> {
    if (participant.role !== "facilitator") {
      this.reject(
        ws,
        undefined,
        "NOT_ADMIN",
        "Only the facilitator can delete the board",
      );
      return;
    }
    await this.destroyBoard();
  }

  // Picks a fresh icebreaker (never repeating the current one) and broadcasts.
  private shuffleIcebreaker(): void {
    const current = this.icebreakerId();
    // Draw over the pool pickIcebreaker will actually use. Drawing over all 24
    // and letting it reduce mod 23 (the bank minus the current question) made
    // the first remaining option twice as likely as every other.
    const poolSize =
      current !== null ? ICEBREAKER_IDS.length - 1 : ICEBREAKER_IDS.length;
    const icebreakerId = pickIcebreaker(randomIndex(poolSize), current);
    this.setMeta("icebreakerId", icebreakerId);
    this.broadcastAll({
      type: "checkin.shuffled",
      seq: this.nextSeq(),
      icebreakerId,
    });
  }

  private handleCheckinShuffle(
    ws: WebSocket,
    participant: ParticipantRow,
  ): void {
    if (participant.role !== "facilitator") {
      this.reject(
        ws,
        undefined,
        "NOT_ADMIN",
        "Only the facilitator shuffles the check-in",
      );
      return;
    }
    if (this.phase() !== "checkin") {
      this.reject(ws, undefined, "PHASE_LOCKED", "The check-in is not open");
      return;
    }
    this.shuffleIcebreaker();
  }

  private handleAgreementsSet(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "admin.agreements.set" }>,
  ): void {
    if (participant.role !== "facilitator") {
      this.reject(
        ws,
        undefined,
        "NOT_ADMIN",
        "Only the facilitator edits the agreements",
      );
      return;
    }
    this.setMeta("workingAgreements", cmd.text);
    this.broadcastAll({
      type: "agreements.changed",
      seq: this.nextSeq(),
      text: cmd.text,
    });
  }

  private handleRotiSet(
    ws: WebSocket,
    participant: ParticipantRow,
    cmd: Extract<ClientCommand, { type: "roti.set" }>,
  ): void {
    // ROTI runs in the closing phase (alongside the appreciation wall), and
    // only until its result is published — a poll does not reopen after its
    // average is out, or a second release could be differenced against the first.
    if (this.phase() !== "close" || this.rotiReleased() !== null) {
      this.reject(ws, undefined, "PHASE_LOCKED", "The ROTI poll is closed");
      return;
    }
    this.sql.exec(
      `INSERT INTO roti (participant_id, score) VALUES (?, ?)
       ON CONFLICT(participant_id) DO UPDATE SET score = excluded.score`,
      participant.id,
      cmd.score,
    );
    // Anonymous: only the running aggregate is broadcast; the caster learns
    // their own score via a private frame to EVERY one of their sockets (a
    // second tab / projector must not show a stale selection), never fanning
    // the individual score to anyone else.
    this.sendRotiYouTo(participant.id, cmd.score);
    // Only the COUNT moves while the poll is open. See ROTI_MIN_ANONYMOUS.
    this.broadcastRotiAggregate();
  }

  /** Everything anyone but the caster may learn about the poll. `average` is
   *  null until the poll is released, and stays null if too few answered. */
  private rotiReleased(): { count: number; average: number | null } | null {
    const raw = this.getMeta("rotiReleased");
    if (raw === null) return null;
    try {
      const parsed = rotiReleaseSchema.safeParse(JSON.parse(raw) as unknown);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private broadcastRotiAggregate(): void {
    const agg = this.rotiAggregate();
    this.broadcastAll({
      type: "roti.aggregate",
      seq: this.nextSeq(),
      count: agg.count,
      average: agg.average,
      released: agg.released,
    });
  }

  /** Publish the result once, on leaving the closing phase, and freeze it. */
  private releaseRoti(): void {
    if (this.rotiReleased() !== null) return;
    const row = this.sql
      .exec("SELECT COUNT(*) AS n, COALESCE(AVG(score), 0) AS avg FROM roti")
      .toArray()[0];
    const count = Number(row?.n ?? 0);
    if (count === 0) return; // nobody answered — nothing to publish or freeze
    const average =
      count < ROTI_MIN_ANONYMOUS
        ? null
        : Math.round(Number(row?.avg ?? 0) * 10) / 10;
    this.setMeta("rotiReleased", JSON.stringify({ count, average }));
    this.broadcastRotiAggregate();
  }

  private rotiAggregate(): {
    count: number;
    average: number | null;
    released: boolean;
  } {
    // Once released the figures are frozen, so every later read — a resync, a
    // late joiner, a rewind — reports the identical pair. While the poll is
    // open only the count is knowable; the average is withheld from everyone,
    // including the facilitator (see ROTI_MIN_ANONYMOUS).
    const released = this.rotiReleased();
    if (released !== null) return { ...released, released: true };
    const count = Number(
      this.sql.exec("SELECT COUNT(*) AS n FROM roti").toArray()[0]?.n ?? 0,
    );
    return { count, average: null, released: false };
  }

  private myRotiScore(participantId: string): number | null {
    const row = this.sql
      .exec("SELECT score FROM roti WHERE participant_id = ?", participantId)
      .toArray()[0];
    return row === undefined ? null : Number(row.score);
  }

  private kudoRowById(id: string): KudoRow | null {
    return (
      (this.sql.exec("SELECT * FROM kudos WHERE id = ?", id).toArray()[0] as
        KudoRow | undefined) ?? null
    );
  }

  private kudoById(id: string): Kudo | null {
    const row = this.kudoRowById(id);
    return row === null ? null : rowToKudo(row);
  }

  private allKudos(): Kudo[] {
    return this.sql
      .exec("SELECT * FROM kudos ORDER BY created_at")
      .toArray()
      .map((row) => rowToKudo(row as unknown as KudoRow));
  }

  // A stored gif URL must be https on the allowlisted provider host AND the
  // board must have GIFs enabled — otherwise it is dropped (not stored). This
  // stops a modified client from planting an arbitrary external <img> that
  // would leak every viewer's IP, and enforces the per-board opt-out that is
  // otherwise only a client-side gate. Preserves undefined ("keep" on update).
  private sanitizeGifUrl(
    url: string | null | undefined,
  ): string | null | undefined {
    if (url === undefined) return undefined;
    if (url === null) return null;
    if (this.getMeta("gifsEnabled") === "0") return null;
    let host: string;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") return null;
      host = parsed.hostname.toLowerCase();
    } catch {
      return null;
    }
    const suffix = (this.env.GIF_HOST_SUFFIX || "klipy.com").toLowerCase();
    if (host === suffix || host.endsWith("." + suffix)) return url;
    // Silent otherwise: the note saves without its GIF and nobody is told why.
    // The likely cause is not an attack but a misconfigured GIF_HOST_SUFFIX —
    // the provider serving media from a CDN host nobody checked — so name the
    // host that was refused. Never the rest of the URL, which is a search term.
    console.error(
      `[gifs] refused media host "${host}" (GIF_HOST_SUFFIX is "${suffix}")`,
    );
    return null;
  }

  // Staged reveal: the wall is empty until the close phase; anonymous kudos
  // never expose the sender id (kept server-side only for delete authorship).
  private kudosForPhase(phase: Phase, _viewerId: string): Kudo[] {
    if (phase !== "close" && phase !== "done") return [];
    return this.allKudos();
  }

  // RPC: structured board snapshot for the export route. Author/owner/sender
  // names are included only when the caller opts in (default: depersonalized).
  async exportBoard(includeAuthors: boolean): Promise<BoardExport | null> {
    if (this.getMeta("id") === null) return null;
    const names = new Map(
      this.sql
        .exec("SELECT id, name FROM participants")
        .toArray()
        .map((row) => [String(row.id), String(row.name)] as const),
    );
    const nameOf = (id: string | null): string | null =>
      includeAuthors && id !== null ? (names.get(id) ?? null) : null;
    // An anonymous board strips note authorship on the wire
    // (redactNoteForViewer), and the export must not be the one surface that
    // hands it back — the file is downloadable by any board-id holder and is
    // meant to be shared. Scoped to note authorship exactly like the live
    // rule: an action owner and a kudo recipient are deliberate, addressed
    // assignments, not authorship.
    const anonymous = this.anonymous();
    const authorNameOf = (id: string | null): string | null =>
      anonymous ? null : nameOf(id);

    // Privacy: notes are private per-author until the reveal, and during the
    // presenting round they belong to the authors the rotation has reached —
    // so the export applies the reveal a viewer with NO identity would get.
    // Without this the download is a way around the round: the route is open
    // to any holder of the board id, which every participant has. Vote tallies
    // stay blind until the reveal closes (discuss onward), exactly like the
    // live votesForSync.
    const phase = this.phase();
    const reveal = publicReveal(phase, this.picker(), anonymous);
    const talliesShown =
      phase === "discuss" || phase === "close" || phase === "done";
    const revealedVotes = talliesShown
      ? this.talliesAndTop()
      : {
          tallies: {} as Record<string, number>,
          topTargetIds: [] as string[],
          voters: null as Record<string, Record<string, number>> | null,
        };
    // Voter names are personal names, so they ride the SAME opt-in as author
    // names. Without this the default download — the one meant to be pasted
    // into a team channel — would carry names the live board only shows to
    // people in the room. talliesAndTop has already applied the anonymity and
    // facilitator gates; this adds the exporter's.
    const voterNamesOf = (votableId: string): string[] | null => {
      if (!includeAuthors || anonymous) return null;
      const spent = revealedVotes.voters?.[votableId];
      if (spent === undefined) return null;
      return Object.keys(spent)
        .map((id) => names.get(id))
        .filter((name): name is string => name !== undefined)
        .sort();
    };

    const notesByColumn = new Map<string, Note[]>();
    // "" is a viewer who owns nothing: the export is nobody's screen, so it can
    // only carry what EVERY member may already read.
    const exported = new Set<string>();
    for (const note of this.allNotes()) {
      if (!noteVisibleTo(note, "", reveal)) continue;
      exported.add(note.id);
      const list = notesByColumn.get(note.columnId) ?? [];
      list.push(note);
      notesByColumn.set(note.columnId, list);
    }

    // Hidden (staged) columns are omitted from the export — it has no viewer to
    // scope to and may be shared, so a hidden column's contents must not surface.
    const columns = this.columns()
      .filter((column) => !column.hidden)
      .map((column) => {
        // Every note is exported (stack members included — no content dropped);
        // stacks are kept adjacent, and only the votable (ungrouped note or
        // stack anchor) carries the tally so votes aren't double-counted.
        const notes = (notesByColumn.get(column.id) ?? [])
          .slice()
          .sort(
            (a, b) =>
              (a.groupId ?? a.id).localeCompare(b.groupId ?? b.id) ||
              a.order - b.order ||
              a.id.localeCompare(b.id),
          );
        return {
          name: column.name,
          notes: notes.map((n) => {
            const isVotable = n.groupId === null || n.groupId === n.id;
            const votableId = n.groupId ?? n.id;
            const rank = isVotable
              ? revealedVotes.topTargetIds.indexOf(votableId)
              : -1;
            return {
              text: n.text,
              gifUrl: n.gifUrl,
              authorName: authorNameOf(n.authorId),
              votes: isVotable
                ? (revealedVotes.tallies[votableId] ?? null)
                : null,
              crownedRank: rank >= 0 ? rank + 1 : null,
              // Same rule as the wire: a stack id is its anchor note's id, so
              // it is only carried when that anchor is in the file too.
              groupId:
                n.groupId !== null && exported.has(n.groupId)
                  ? n.groupId
                  : null,
              // Only the votable carries them, exactly like the tally — a
              // stacked member must not repeat its anchor's voters.
              voterNames: isVotable ? voterNamesOf(votableId) : null,
            };
          }),
        };
      });

    return {
      boardName: this.getMeta("name") ?? "",
      createdAt: Number(this.getMeta("createdAt") ?? 0),
      columns,
      actions: this.actions().map((a) => ({
        text: a.text,
        ownerName: nameOf(a.ownerId),
        done: a.status === "done",
      })),
      kudos: this.allKudos().map((k) => ({
        cardType: k.cardType,
        // The sentinel names the room, not a roster row. Spelled out in
        // English beside the existing "someone" fallback — the export file is
        // English throughout (see KUDO_CARD_LABELS), never translated.
        toName:
          k.toId === KUDO_EVERYONE
            ? "Everyone"
            : (names.get(k.toId) ?? "someone"),
        fromName: authorNameOf(k.fromId),
        text: k.text,
      })),
    };
  }

  // ---------------------------------------------------------------------
  // snapshots & broadcast plumbing
  // ---------------------------------------------------------------------

  // ---- the presenting walkthrough -------------------------------------
  // ONE card on stage, driven by the facilitator, followed by every screen.
  // Stored in board_meta rather than on the instance: the DO hibernates, and a
  // field parked in memory would evaporate mid-round.

  /** Whether the walkthrough may run at all.
   *
   *  NEVER on an anonymous board, and this is the load-bearing gate rather
   *  than a nicety: the spotlight is a NOTE ID, `picker.spun` names the
   *  presenter in plaintext, and the pair reconstructs exactly the authorship
   *  an anonymous board promised to strip — the same reasoning revealFor's
   *  rule 4 gives for refusing to scope such a board at all. Gated on the
   *  server, not in the UI, because the leak is on the wire. */
  private spotlightAllowed(): boolean {
    return !this.anonymous();
  }

  private spotlight(): string | null {
    return this.spotlightAllowed() ? this.getMeta("spotlight") : null;
  }

  /** The staged card AS THIS VIEWER may see it. A note id is a secret here —
   *  handing one to somebody the rotation has not reached would name a card
   *  they were never sent, which is the same class of leak the reorg and
   *  columnCount filters exist to close. */
  private spotlightFor(participant: ParticipantRow): string | null {
    const targetId = this.spotlight();
    if (targetId === null) return null;
    const note = this.noteById(targetId);
    if (note === null) return null;
    const gate = this.gateFor(participant.id, this.revealNow());
    return noteVisibleTo(note, participant.id, gate.reveal, gate.hidden)
      ? targetId
      : null;
  }

  /** Per-recipient fan-out, the second lock after the handler's own checks. */
  private broadcastSpotlight(targetId: string | null): void {
    const note = targetId === null ? null : this.noteById(targetId);
    const board = this.revealNow();
    const seq = this.nextSeq();
    this.broadcastEach((recipientId) => {
      const gate = this.gateFor(recipientId, board);
      const visible =
        note !== null &&
        noteVisibleTo(note, recipientId, gate.reveal, gate.hidden);
      return {
        type: "spotlight.changed",
        seq,
        targetId: visible ? targetId : null,
      };
    });
  }

  private setSpotlight(targetId: string | null): void {
    // An anonymous board never stages a card, so the id never reaches the
    // wire — not even the null clear, which would be noise for a feature that
    // is off. Every caller (spin, pick, skip, done, reconcile) routes here.
    if (!this.spotlightAllowed()) return;
    if (targetId === null)
      this.sql.exec("DELETE FROM board_meta WHERE key = 'spotlight'");
    else this.setMeta("spotlight", targetId);
    this.broadcastSpotlight(targetId);
  }

  /** Put the new presenter's FIRST card on stage, so the common path never
   *  needs a click to start — and never a rejected one. Silent when they have
   *  no cards: the stage simply stays empty and the button says "next person". */
  private seedSpotlight(presenterId: string): void {
    const order = presenterCardOrder(
      this.allNotes(),
      this.columns(),
      presenterId,
    );
    this.setSpotlight(order[0] ?? null);
  }

  /** The staged card can vanish under the facilitator: they may delete any
   *  card during the round, and staging its column takes it off every screen.
   *  Called from both, so a dangling id never survives. */
  private reconcileSpotlight(): void {
    const targetId = this.spotlight();
    if (targetId === null) return;
    const note = this.noteById(targetId);
    const hidden = note !== null && this.hiddenColumnIds().has(note.columnId);
    if (note === null || hidden) this.setSpotlight(null);
  }

  private picker(): PickerState | null {
    const raw = this.getMeta("picker");
    if (raw === null) return null;
    const parsed = pickerStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  }

  private savePicker(picker: PickerState): void {
    this.setMeta("picker", JSON.stringify(picker));
  }

  private lastSpin(): WheelSpin | null {
    const raw = this.getMeta("lastSpin");
    if (raw === null) return null;
    const parsed = wheelSpinSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  }

  private activeSpinForSync(): WheelSpin | null {
    const spin = this.lastSpin();
    if (spin === null) return null;
    return Date.now() < spin.startAt + spin.durationMs + WHEEL_HOLD_MS
      ? spin
      : null;
  }

  // Anonymized note totals per column (all authors, no ids, no text) — the
  // write-phase "cards exist" signal. Columns with no notes are simply absent
  // (the client reads them as 0).
  /** Per-column note totals, minus any column the viewer cannot see. Without
   *  the hidden filter these counts named every staged column's id and told a
   *  member how many notes were in it — the one place the staged-column rule
   *  leaked, because the counts went out through broadcastAll rather than the
   *  per-recipient filter every other note-bearing event uses. */
  private columnCounts(
    hiddenFor: ReadonlySet<string> | null,
  ): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const row of this.sql
      .exec("SELECT column_id, COUNT(*) AS n FROM notes GROUP BY column_id")
      .toArray()) {
      const columnId = String(row.column_id);
      if (hiddenFor !== null && hiddenFor.has(columnId)) continue;
      counts[columnId] = Number(row.n);
    }
    return counts;
  }

  // Foreign write-phase notes are represented only by their occupied canvas
  // position. No stable identifier, author or content crosses the privacy
  // boundary, so the placeholder cannot be joined to the later reveal.
  private canvasOccupancyFor(
    notes: readonly Note[],
    recipientId: string,
    hiddenFor: ReadonlySet<string> | null,
  ): CanvasOccupancy[] {
    return notes
      .filter(
        (note) =>
          note.authorId !== recipientId &&
          (hiddenFor === null || !hiddenFor.has(note.columnId)),
      )
      .map((note) => {
        const position =
          note.x !== null && note.y !== null
            ? { x: note.x, y: note.y }
            : scatterPos(note.id);
        return { columnId: note.columnId, ...position };
      });
  }

  // Broadcast fresh counts, but only while writing — the placeholder they feed
  // is a write-phase affordance, and from the reveal on everyone sees the notes
  // themselves. Per recipient, so a staged column never reaches a member.
  private broadcastColumnCountsIfWriting(): void {
    if (this.phase() !== "write") return;
    const hidden = this.hiddenColumnIds();
    const notes = this.allNotes();
    const seq = this.nextSeq();
    this.broadcastEach((recipientId) => {
      const hiddenFor = this.hiddenSetFor(recipientId, hidden);
      return {
        type: "board.columnCounts",
        seq,
        counts: this.columnCounts(hiddenFor),
        canvasOccupancy: this.canvasOccupancyFor(notes, recipientId, hiddenFor),
      };
    });
  }

  private buildSync(
    participant: ParticipantRow,
    sessionKey: string,
  ): ServerEvent {
    const phase = this.phase();
    const notes = this.allNotes();
    // null for facilitators (they see every column); the hidden-column set for
    // members — gates BOTH the columns array and the notes below.
    const hiddenColumns = this.hiddenColumnsFor(participant);
    return {
      type: "sync",
      seq: this.currentSeq(),
      serverNow: Date.now(),
      board: this.boardInfo(),
      config: this.config(),
      phase,
      timer: this.timer(),
      you: { ...rowToParticipant(participant), sessionKey },
      protocolVersion: PROTOCOL_VERSION,
      roster: this.roster(),
      readyIds: this.sql
        .exec("SELECT id FROM participants WHERE ready = 1")
        .toArray()
        .map((row) => String(row.id)),
      // Members never receive hidden (staged) columns; facilitators see all.
      columns:
        hiddenColumns === null
          ? this.columns()
          : this.columns().filter((c) => !c.hidden),
      // Anonymized per-column totals only matter while writing; other phases
      // reveal the notes themselves, so send an empty map there.
      columnCounts:
        phase === "write"
          ? this.columnCounts(
              this.hiddenSetFor(participant.id, this.hiddenColumnIds()),
            )
          : {},
      canvasOccupancy:
        phase === "write"
          ? this.canvasOccupancyFor(notes, participant.id, hiddenColumns)
          : [],
      picker: this.picker(),
      lastSpin: this.activeSpinForSync(),
      votes: this.votesForSync(participant.id, phase),
      discussFocusId: this.getMeta("discussFocus"),
      // Through the SAME per-viewer filter as the notes below: a member who
      // was never handed the staged card is told null, not its id.
      spotlightId: this.spotlightFor(participant),
      actions: this.actions(),
      // Staged reveal: the appreciation wall only appears from the close phase.
      kudos: this.kudosForPhase(phase, participant.id),
      icebreakerId: this.icebreakerId(),
      workingAgreements: this.getMeta("workingAgreements") ?? "",
      roti: {
        ...this.rotiAggregate(),
        yourScore: this.myRotiScore(participant.id),
      },
      retentionAt: this.retentionAt(),
      // The snapshot passes through the SAME visibility filter as live
      // events — including the hidden-column gate — the classic leak path.
      notes: visibleNotesFor(
        notes,
        participant.id,
        this.revealOf(participant),
        this.anonymous(),
        hiddenColumns,
      ),
    };
  }

  // Send a note event to every recipient allowed to see the note, with
  // per-recipient anonymity redaction.
  private broadcastNoteEvent(
    makeEvent: (note: Note) => ServerEvent,
    note: Note,
  ): void {
    const board = this.revealNow();
    const anonymous = this.anonymous();
    // The stack's anchor decides whether this recipient may be told the
    // groupId: the group's id IS the anchor note's id, so a member on the
    // wrong side of the presenting boundary would otherwise be handed the id
    // of a card they have not been shown.
    const anchor = this.anchorOf(note);
    this.broadcastEach((recipientId) => {
      const gate = this.gateFor(recipientId, board);
      if (!noteVisibleTo(note, recipientId, gate.reveal, gate.hidden)) {
        return null;
      }
      return makeEvent(
        redactNoteForViewer(
          note,
          recipientId,
          anonymous,
          note.groupId === null ||
            (anchor !== null &&
              noteVisibleTo(anchor, recipientId, gate.reveal, gate.hidden)),
        ),
      );
    });
  }

  // Fan-out after a move/group that may change a note's COLUMN — and therefore
  // whether a member may see it. Recipients who can see it now get an upserting
  // note.updated; a member who can no longer see it because the note landed in
  // a staged (hidden) column gets a note.deleted, so no stale card lingers in
  // its old position (the note-level analogue of column hide/reveal). Ordinary
  // pre-reveal privacy is unaffected: when the note is NOT in a hidden column,
  // non-viewers get nothing, exactly like broadcastNoteEvent.
  /** Fan out a note that may have changed column. A recipient who can still
   *  see it gets an update; one who could see it BEFORE but not now gets a
   *  delete so it leaves their board.
   *
   *  `previousColumnId` is what makes the delete safe. Without it, a note moved
   *  between two staged columns produced a note.deleted carrying the id of a
   *  note the member had never been shown — announcing the existence of
   *  something inside a column that is supposed to be invisible. */
  private broadcastNoteReorg(note: Note, previousColumnId?: string): void {
    const board = this.revealNow();
    const anonymous = this.anonymous();
    const anchor = this.anchorOf(note);
    const before: Note = {
      ...note,
      columnId: previousColumnId ?? note.columnId,
    };
    const seq = this.nextSeq();
    this.broadcastEach((recipientId) => {
      const gate = this.gateFor(recipientId, board);
      if (noteVisibleTo(note, recipientId, gate.reveal, gate.hidden)) {
        return {
          type: "note.updated",
          seq,
          note: redactNoteForViewer(
            note,
            recipientId,
            anonymous,
            note.groupId === null ||
              (anchor !== null &&
                noteVisibleTo(anchor, recipientId, gate.reveal, gate.hidden)),
          ),
        };
      }
      // Only tell them it is gone if they had it in the first place.
      return noteVisibleTo(before, recipientId, gate.reveal, gate.hidden)
        ? { type: "note.deleted", seq, noteId: note.id }
        : null;
    });
  }

  // The hidden-column gate for a specific recipient: null (sees all) for a
  // facilitator, otherwise the precomputed set. Pass the set in so a per-note
  // fan-out doesn't re-query the hidden columns for every recipient.
  private hiddenSetFor(
    recipientId: string,
    hidden: ReadonlySet<string>,
  ): ReadonlySet<string> | null {
    return this.participantById(recipientId)?.role === "facilitator"
      ? null
      : hidden;
  }

  // The stack anchor a note hangs off, as the visibility gate needs it. Null
  // for a loose note AND for a dangling group id — a missing anchor strips the
  // group, which is the safe answer either way.
  private anchorOf(note: Note): Pick<Note, "authorId" | "columnId"> | null {
    if (note.groupId === null) return null;
    const row = this.noteRowById(note.groupId);
    return row === null
      ? null
      : { authorId: row.author_id, columnId: row.column_id };
  }

  // Everything the per-recipient gate needs about the BOARD, read once per
  // fan-out instead of once per recipient.
  private revealNow(): RevealSnapshot {
    const phase = this.phase();
    const picker = this.picker();
    const anonymous = this.anonymous();
    return {
      memberReveal: revealFor(phase, "member", picker, anonymous),
      facilitatorReveal: revealFor(phase, "facilitator", picker, anonymous),
      hidden: this.hiddenColumnIds(),
    };
  }

  // The reveal for a command handler, which already holds the participant row.
  private revealOf(participant: ParticipantRow): NoteReveal {
    return revealFor(
      this.phase(),
      participant.role === "facilitator" ? "facilitator" : "member",
      this.picker(),
      this.anonymous(),
    );
  }

  // The gate for ONE recipient of a fan-out. Both dimensions in one helper
  // because hiddenSetFor already did the participantById() lookup: splitting
  // them would double the per-recipient row reads on every note event. An
  // unknown participant reads as a member — the same fail-closed normalisation
  // hiddenSetFor already had.
  private gateFor(
    recipientId: string,
    board: RevealSnapshot,
  ): { reveal: NoteReveal; hidden: ReadonlySet<string> | null } {
    return this.participantById(recipientId)?.role === "facilitator"
      ? { reveal: board.facilitatorReveal, hidden: null }
      : { reveal: board.memberReveal, hidden: board.hidden };
  }

  // THE only way a viewer's visible set grows. Push every note each recipient
  // may see NOW and could not see under `before`, decided by the same predicate
  // that gates every other send — so a widening can neither miss a note nor
  // send one twice, and a caller cannot forget the burst by writing an `if`
  // wrong. `before` carries BOTH privacy dimensions, so the same helper serves
  // the rotation, the phase change, a column reveal and a promotion.
  //
  // Callers that widen nothing may call it: the difference is empty, nobody
  // gets a frame, and not even a seq is spent — nextSeq() is a row WRITE.
  private broadcastNewlyVisible(before: RevealSnapshot): void {
    const after = this.revealNow();
    const notes = this.allNotes();
    const byId = new Map(notes.map((n) => [n.id, n] as const));
    const anonymous = this.anonymous();
    let seq: number | null = null;
    this.broadcastEach((recipientId) => {
      const now = this.gateFor(recipientId, after);
      const was = this.gateFor(recipientId, before);
      const sees = (n: Note, gate: typeof now): boolean =>
        noteVisibleTo(n, recipientId, gate.reveal, gate.hidden);
      // Whether the stack's anchor is visible is part of what a recipient was
      // told: a note whose anchor they cannot see is delivered ungrouped. So a
      // widening that uncovers the ANCHOR has to re-send the members of that
      // stack too, or the client keeps a loose card the next snapshot shows
      // stacked — and the symmetry gate is exactly the test for that.
      const anchored = (n: Note, gate: typeof now): boolean => {
        if (n.groupId === null) return true;
        const anchor = byId.get(n.groupId);
        return anchor !== undefined && sees(anchor, gate);
      };
      const newly = notes.filter(
        (n) =>
          sees(n, now) &&
          (!sees(n, was) || (anchored(n, now) && !anchored(n, was))),
      );
      if (newly.length === 0) return null;
      seq ??= this.nextSeq();
      return {
        type: "notes.revealed",
        seq,
        notes: newly.map((n) =>
          redactNoteForViewer(n, recipientId, anonymous, anchored(n, now)),
        ),
      };
    });
  }

  // Per-recipient fan-out: the mapper decides, per participant, which event
  // (if any) their sockets receive. THE privacy enforcement point.
  private broadcastEach(
    makeEvent: (participantId: string) => ServerEvent | null,
  ): void {
    const cache = new Map<string, string | null>();
    for (const ws of this.ctx.getWebSockets()) {
      const participantId = readAttachment(ws)?.participantId ?? null;
      if (participantId === null) continue; // not joined yet
      let frame = cache.get(participantId);
      if (frame === undefined) {
        const event = makeEvent(participantId);
        frame = event === null ? null : JSON.stringify(event);
        cache.set(participantId, frame);
      }
      if (frame !== null) this.trySend(ws, frame);
    }
  }

  private broadcastAll(event: ServerEvent, exclude?: WebSocket): void {
    const frame = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      // Same normalization as broadcastEach: an unreadable attachment must be
      // skipped, not treated as joined. `?.participantId === null` alone is
      // false for an undefined attachment, which would fail OPEN here while
      // broadcastEach fails closed — the two fan-outs must agree.
      if ((readAttachment(ws)?.participantId ?? null) === null) continue;
      this.trySend(ws, frame);
    }
  }

  private send(ws: WebSocket, event: ServerEvent): void {
    this.trySend(ws, JSON.stringify(event));
  }

  // A socket can die between getWebSockets() and send() — one dead socket
  // must never abort a fan-out after SQL has committed. Its own close/error
  // handler does the disconnect bookkeeping.
  private trySend(ws: WebSocket, frame: string): void {
    try {
      ws.send(frame);
    } catch {
      // dead socket — skip
    }
  }

  /** `seq` here is the board's ordering stamp AT THE MOMENT of acknowledgement,
   *  not a sequence number belonging to the operation. Handlers that emit one
   *  broadcast pass that event's seq; the rest report the current stamp, and an
   *  idempotent retry has no event of its own to report at all. Nothing
   *  reconciles on it — recovery is a blanket resync (see protocol.ts) — so it
   *  is a diagnostic, and the doc comment says so rather than the field
   *  pretending to a precision it cannot have uniformly. */
  private ack(ws: WebSocket, opId: string, seq?: number): void {
    this.send(ws, { type: "ack", opId, seq: seq ?? this.currentSeq() });
  }

  private reject(
    ws: WebSocket,
    opId: string | undefined,
    code: RejectCode,
    reason: string,
  ): void {
    this.send(
      ws,
      opId === undefined
        ? { type: "reject", code, reason }
        : { type: "reject", opId, code, reason },
    );
  }

  // ---------------------------------------------------------------------
  // storage accessors
  // ---------------------------------------------------------------------

  private participantForSocket(ws: WebSocket): ParticipantRow | null {
    const participantId = readAttachment(ws)?.participantId ?? null;
    return participantId === null ? null : this.participantById(participantId);
  }

  private participantById(id: string): ParticipantRow | null {
    return (
      (this.sql
        .exec("SELECT * FROM participants WHERE id = ?", id)
        .toArray()[0] as ParticipantRow | undefined) ?? null
    );
  }

  private columnById(id: string): Column | null {
    const row = this.sql
      .exec("SELECT * FROM columns WHERE id = ?", id)
      .toArray()[0];
    return row === undefined ? null : rowToColumn(row);
  }

  private columns(): Column[] {
    return this.sql
      .exec("SELECT * FROM columns ORDER BY ord")
      .toArray()
      .map(rowToColumn);
  }

  // Every currently-hidden column id. Used to withhold hidden columns and their
  // notes from members on both the live wire and the sync snapshot.
  private hiddenColumnIds(): Set<string> {
    return new Set(
      this.sql
        .exec("SELECT id FROM columns WHERE hidden = 1")
        .toArray()
        .map((row) => String(row.id)),
    );
  }

  // The hidden-column set as this viewer experiences it: facilitators see every
  // column (null = no gate), members have hidden columns withheld.
  private hiddenColumnsFor(
    participant: ParticipantRow,
  ): ReadonlySet<string> | null {
    return participant.role === "facilitator" ? null : this.hiddenColumnIds();
  }

  // The column as this participant may act on it. A hidden column is invisible
  // to members — treated exactly like a non-existent one (NOT_FOUND, no
  // existence oracle). Facilitators may target hidden columns.
  private columnFor(
    columnId: string,
    participant: ParticipantRow,
  ): Column | null {
    const column = this.columnById(columnId);
    if (column === null) return null;
    if (column.hidden && participant.role !== "facilitator") return null;
    return column;
  }

  private noteRowById(id: string): NoteRow | null {
    return (
      (this.sql.exec("SELECT * FROM notes WHERE id = ?", id).toArray()[0] as
        NoteRow | undefined) ?? null
    );
  }

  private noteById(id: string): Note | null {
    const row = this.noteRowById(id);
    if (row === null) return null;
    // Targeted read — the full-table reactionsByNote() scan would bill
    // O(all reactions on the board) rows for every single note event.
    const reactions: Record<string, string[]> = {};
    for (const r of this.sql
      .exec("SELECT participant_id, emoji FROM reactions WHERE note_id = ?", id)
      .toArray()) {
      (reactions[String(r.emoji)] ??= []).push(String(r.participant_id));
    }
    return { ...this.buildNote(row, new Map()), reactions };
  }

  private allNotes(): Note[] {
    const reactions = this.reactionsByNote();
    return this.sql
      .exec("SELECT * FROM notes ORDER BY ord")
      .toArray()
      .map((row) => this.buildNote(row as unknown as NoteRow, reactions));
  }

  private buildNote(
    row: NoteRow,
    reactionsByNote: Map<string, Record<string, string[]>>,
  ): Note {
    return {
      id: row.id,
      columnId: row.column_id,
      authorId: row.author_id,
      text: row.text,
      gifUrl: row.gif_url ?? null,
      order: Number(row.ord),
      x: row.pos_x ?? null,
      y: row.pos_y ?? null,
      groupId: row.group_id ?? null,
      reactions: reactionsByNote.get(row.id) ?? {},
    };
  }

  private reactionsByNote(): Map<string, Record<string, string[]>> {
    const map = new Map<string, Record<string, string[]>>();
    for (const row of this.sql.exec("SELECT * FROM reactions").toArray()) {
      const noteId = String(row.note_id);
      const emoji = String(row.emoji);
      const byEmoji = map.get(noteId) ?? {};
      (byEmoji[emoji] ??= []).push(String(row.participant_id));
      map.set(noteId, byEmoji);
    }
    return map;
  }

  private roster(): Participant[] {
    return this.sql
      .exec("SELECT * FROM participants ORDER BY joined_at")
      .toArray()
      .map((row) => rowToParticipant(row as unknown as ParticipantRow));
  }

  private boardInfo(): BoardInfo {
    return {
      id: this.getMeta("id") ?? "",
      name: this.getMeta("name") ?? "",
      createdAt: Number(this.getMeta("createdAt") ?? 0),
    };
  }

  private config(): BoardConfig {
    const maxRaw = this.getMeta("maxPerTarget");
    return {
      anonymous: this.anonymous(),
      phasePlan: this.phasePlan(),
      votesPerPerson: Number(
        this.getMeta("votesPerPerson") ?? DEFAULT_VOTE_CONFIG.votesPerPerson,
      ),
      maxPerTarget: maxRaw === null || maxRaw === "" ? null : Number(maxRaw),
      topN: Number(this.getMeta("topN") ?? DEFAULT_VOTE_CONFIG.topN),
      // Default true for boards created before the toggle existed.
      gifsEnabled: this.getMeta("gifsEnabled") !== "0",
      // Validated against the schema, not a hand-written ternary. The old
      // `=== "slots" ? "slots" : "wheel"` made the picker's extensibility a
      // lie: a third style would broadcast correctly live and then silently
      // revert to the wheel on every reconnect, every sync and every board
      // duplication. Same fail-safe direction as phase() — an unreadable value
      // reads as the classic wheel.
      pickerStyle:
        pickerStyleSchema.safeParse(this.getMeta("pickerStyle")).data ??
        "wheel",
      // Same reasoning as pickerStyle above; columns for boards created
      // before the layout field, and for anything unreadable.
      layout:
        layoutModeSchema.safeParse(this.getMeta("layout")).data ?? "columns",
      // Live cursors are OFF unless a facilitator opted in (protects the free
      // tier); default off for boards created before the field.
      cursorsEnabled: this.getMeta("cursorsEnabled") === "1",
      // Off for boards created before the field: a round already voted under
      // the blind promise must not be de-blinded by a deploy. New boards are
      // seeded with "1" in initialize().
      voterNamesEnabled: this.getMeta("voterNamesEnabled") === "1",
      // Default off for boards created before the field.
      focusMode: this.getMeta("focusMode") === "1",
    };
  }

  private retentionAt(): number | null {
    const raw = this.getMeta("retentionAt");
    return raw === null ? null : Number(raw);
  }

  // Validated, not cast. zod guards the wire; the database was guarded by
  // nothing, so a value written by an older build (or a hand-edited row) became
  // a Phase by assertion and every downstream switch silently misbehaved.
  // Falling back to "lobby" is the safe direction: it reveals nothing.
  private phase(): Phase {
    const parsed = phaseSchema.safeParse(this.getMeta("phase"));
    return parsed.success ? parsed.data : "lobby";
  }

  private phasePlan() {
    const raw = this.getMeta("phasePlan");
    if (raw === null) return DEFAULT_PHASE_PLAN;
    const parsed = phasePlanSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_PHASE_PLAN;
  }

  private anonymous(): boolean {
    return this.getMeta("anonymous") === "1";
  }

  /** Same reasoning as phase(): a stored id that is no longer in the bank must
   *  read as "no question chosen", not as a member of the union by assertion. */
  private icebreakerId(): IcebreakerId | null {
    const parsed = icebreakerIdSchema.safeParse(this.getMeta("icebreakerId"));
    return parsed.success ? parsed.data : null;
  }

  private timer(): Timer {
    const endsAt = this.getMeta("timerEndsAt");
    const paused = this.getMeta("timerPausedMs");
    if (endsAt !== null)
      return { endsAt: Number(endsAt), pausedRemainingMs: null };
    if (paused !== null)
      return { endsAt: null, pausedRemainingMs: Number(paused) };
    return IDLE_TIMER;
  }

  private setTimerMeta(endsAt: number | null, pausedMs: number | null): void {
    this.clearTimerMeta();
    if (endsAt !== null) this.setMeta("timerEndsAt", String(endsAt));
    if (pausedMs !== null) this.setMeta("timerPausedMs", String(pausedMs));
  }

  private clearTimerMeta(): void {
    this.sql.exec(
      "DELETE FROM board_meta WHERE key IN ('timerEndsAt', 'timerPausedMs')",
    );
  }

  private getMeta(key: string): string | null {
    const row = this.sql
      .exec("SELECT value FROM board_meta WHERE key = ?", key)
      .toArray()[0];
    return row === undefined ? null : String(row.value);
  }

  private setMeta(key: string, value: string): void {
    this.sql.exec(
      "INSERT INTO board_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      key,
      value,
    );
  }

  private currentSeq(): number {
    return Number(this.getMeta("seq") ?? 0);
  }

  private nextSeq(): number {
    const next = this.currentSeq() + 1;
    this.setMeta("seq", String(next));
    return next;
  }
}

function nextUtcResetAt(now = Date.now()): number {
  const dayMs = 24 * 60 * 60 * 1000;
  return (Math.floor(now / dayMs) + 1) * dayMs;
}

function rowToParticipant(row: ParticipantRow): Participant {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    role: row.role as ParticipantRole,
    online: row.online === 1,
  };
}

function rowToColumn(row: Record<string, SqlStorageValue>): Column {
  const rect =
    row.rect_x === null || row.rect_x === undefined
      ? null
      : {
          x: Number(row.rect_x),
          y: Number(row.rect_y),
          w: Number(row.rect_w),
          h: Number(row.rect_h),
        };
  return {
    id: String(row.id),
    name: String(row.name),
    order: Number(row.ord),
    hidden: Number(row.hidden) === 1,
    rect,
  };
}

function rowToKudo(row: KudoRow): Kudo {
  return {
    id: row.id,
    cardType: row.card_type as KudoCardType,
    toId: row.to_id,
    fromId: row.from_id ?? null,
    text: row.text,
    gifUrl: row.gif_url ?? null,
  };
}

function readAttachment(ws: WebSocket): SocketAttachment | null {
  const attachment: unknown = ws.deserializeAttachment();
  if (attachment === null || typeof attachment !== "object") return null;
  return attachment as SocketAttachment;
}
