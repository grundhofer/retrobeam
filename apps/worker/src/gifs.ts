// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

// GIF search is proxied through the Worker so the API key stays server-side
// and employee IPs / search terms never reach the provider directly (privacy,
// see docs/05). The provider is isolated behind this one module — GIFs are a
// degradable feature: with no key configured, search returns empty and the UI
// shows a friendly "unavailable" state instead of breaking.
//
// KLIPY is the post-Tenor default (Tenor's API shut down 2026-06-30, GIPHY's
// free production tier is gone). Set the KLIPY_API_KEY secret to enable search.

export interface GifResult {
  id: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
}

export interface GifSearchResponse {
  configured: boolean;
  gifs: GifResult[];
  /** The lookup itself went wrong — provider unreachable, throttled, or a
   *  response we could not read. Distinct from "GIFs are off for this board"
   *  (configured: false) and from "nothing matched" (an empty list). Without
   *  the distinction a provider outage or a changed response shape reads to the
   *  user as "no GIFs found", which is the least actionable message possible. */
  failed?: boolean;
}

const KLIPY_BASE = "https://api.klipy.com/api/v1";

export async function searchGifs(
  env: Env,
  query: string,
  locale: string,
): Promise<GifSearchResponse> {
  const key = env.KLIPY_API_KEY;
  if (!key || query.trim() === "") {
    return { configured: Boolean(key), gifs: [] };
  }

  // Rating is forced to workplace-safe server-side; the client can never widen
  // it. Personalization (customer_id) is deliberately omitted.
  const params = new URLSearchParams({
    q: query,
    rating: "pg",
    locale: locale === "de" ? "de" : "en",
    per_page: "24",
  });
  const url = `${KLIPY_BASE}/${key}/gifs/search?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.error(`[gifs] provider returned ${response.status}`);
      return { configured: true, gifs: [], failed: true };
    }
    const body: unknown = await response.json();
    const items = extractArray(body);
    const gifs = parseKlipy(body);
    // The dangerous case is not a network error, it is a SHAPE change: the
    // provider answers 200 with a list we cannot read, every item is skipped,
    // and the picker says "no GIFs found" for every possible search. Say so.
    if (items.length > 0 && gifs.length === 0) {
      console.error(
        `[gifs] parsed 0 of ${items.length} items — provider response shape changed; ` +
          `first item keys: ${describeKeys(items[0])}`,
      );
      return { configured: true, gifs: [], failed: true };
    }
    return { configured: true, gifs };
  } catch (error) {
    // Provider unreachable / timed out / unparseable — never throw, but never
    // pretend the search simply found nothing either.
    console.error("[gifs] search failed", error);
    return { configured: true, gifs: [], failed: true };
  }
}

/** Field names only — never values, which would put search results in the log. */
function describeKeys(item: unknown): string {
  return typeof item === "object" && item !== null
    ? Object.keys(item).join(",")
    : typeof item;
}

// KLIPY's response shape is Tenor-compatible-ish; parse defensively so a shape
// change degrades to empty rather than crashing the route.
function parseKlipy(body: unknown): GifResult[] {
  const data = extractArray(body);
  const results: GifResult[] = [];
  for (const item of data) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const id = String(record.id ?? record.slug ?? "");
    const media = pickMedia(record);
    if (id === "" || media === null) continue;
    results.push({ id, ...media });
  }
  return results;
}

function extractArray(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (typeof body === "object" && body !== null) {
    const record = body as Record<string, unknown>;
    if (Array.isArray(record.data)) return record.data;
    const nested = record.data;
    if (typeof nested === "object" && nested !== null) {
      const inner = (nested as Record<string, unknown>).data;
      if (Array.isArray(inner)) return inner;
    }
    if (Array.isArray(record.results)) return record.results;
  }
  return [];
}

// KLIPY documents media under `files` (plural) on each result, and separately
// shows flat `url`/`src` fields — so accept both, plus a `file`/`media`
// container, rather than betting on one. A variant may itself be a container of
// formats (`{ gif: {...}, webp: {...} }`), which is why readVariant recurses.
const FULL_KEYS = ["hd", "lg", "md", "original", "gif", "mp4", "webp"];
const PREVIEW_KEYS = ["sm", "xs", "tiny", "preview", "thumbnail", "md", "gif"];

function pickMedia(
  record: Record<string, unknown>,
): Omit<GifResult, "id"> | null {
  const container = record.files ?? record.file ?? record.media ?? record;
  if (typeof container !== "object" || container === null) return null;
  const f = container as Record<string, unknown>;
  const full = readVariant(f, FULL_KEYS) ?? readVariant(record, FULL_KEYS);
  const preview = readVariant(f, PREVIEW_KEYS) ?? full;
  if (full === null) return null;
  return {
    url: full.url,
    previewUrl: preview?.url ?? full.url,
    width: full.width || 0,
    height: full.height || 0,
  };
}

interface Variant {
  url: string;
  width: number;
  height: number;
}

/** Find the first https URL in `value`, trying the named keys in order and
 *  descending one level into each — a variant is often a container of formats
 *  rather than a leaf. Bounded depth on purpose: this is untrusted input. */
function readVariant(
  value: unknown,
  keys: string[],
  depth = 0,
): Variant | null {
  if (typeof value !== "object" || value === null || depth > 2) return null;
  const v = value as Record<string, unknown>;

  const direct = v.url ?? v.gif ?? v.src ?? v.proxy_src;
  if (typeof direct === "string" && direct.startsWith("https://")) {
    return {
      url: direct,
      width: Number(v.width ?? 0) || 0,
      height: Number(v.height ?? 0) || 0,
    };
  }
  for (const key of keys) {
    const found = readVariant(v[key], keys, depth + 1);
    if (found !== null) return found;
  }
  return null;
}
