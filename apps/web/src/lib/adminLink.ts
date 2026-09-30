// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { loadAdminToken, saveAdminToken } from "./session.js";

// The facilitator link: `/board/<id>#admin=<token>`. The token is the whole
// facilitator capability (it duplicates and deletes the board), so it rides in
// the FRAGMENT — the one part of a URL a browser never sends anywhere: not in
// the request line, not in a Referer, not to any log. Only this script reads it,
// hands it to localStorage, and wipes it from the address bar again.
const ADMIN_PARAM = "admin";
// Same shape as the server's generateSecret(). Lowercase only — that is what
// the server mints, and a token that fails this can never match anyway.
const TOKEN_PATTERN = /^[0-9a-f]{32}$/;

export function adminLinkUrl(
  origin: string,
  boardId: string,
  adminToken: string,
): string {
  return `${origin}/board/${boardId}#${ADMIN_PARAM}=${adminToken}`;
}

export type AdminFragment = {
  // The token if the fragment carried a well-formed one, otherwise null.
  token: string | null;
  // What the fragment becomes once every admin= part is gone ("" or "#…").
  hash: string;
};

// Pure: pulls every `admin=` part out of a location.hash. Returns null when
// there is none, so the caller leaves a fragment it does not own untouched.
// A malformed value is still stripped — a truncated token pasted from a chat is
// no less a secret-shaped string that should not sit in the address bar.
export function takeAdminFragment(hash: string): AdminFragment | null {
  const parts = hash.replace(/^#/, "").split("&");
  const ours = parts.filter(
    (part) => part === ADMIN_PARAM || part.startsWith(`${ADMIN_PARAM}=`),
  );
  if (ours.length === 0) return null;
  const rest = parts.filter((part) => part !== "" && !ours.includes(part));
  const value = ours[0]?.slice(ADMIN_PARAM.length + 1) ?? "";
  return {
    token: ours.length === 1 && TOKEN_PATTERN.test(value) ? value : null,
    hash: rest.length === 0 ? "" : `#${rest.join("&")}`,
  };
}

// Adopts a facilitator link opened in this tab: stores its token for the board
// and rewrites the current history entry without it, so neither the address bar
// nor Back/Forward keeps the capability. The server still decides — the join
// sends whatever is stored and a wrong token simply joins as a member.
//
// A token this browser already holds for the board is never replaced. Nothing
// rotates a board's token, so a genuine link always carries the stored one; a
// DIFFERENT well-formed value can only be wrong — and anyone who knows the
// board id can make one. Adopting it would cost the creator the only copy of
// the real token, and the join could not even say so: an existing facilitator
// session keeps its role on a wrong token (planJoin), so the sync looks fine.
//
// "adopted" / "conflict" / "malformed" / "none" — the caller only needs to know
// whether a link was there at all, to explain a join that did not come out
// facilitator, and whether it was set aside for the one already stored.
export function adoptAdminLink(
  boardId: string,
): "adopted" | "conflict" | "malformed" | "none" {
  const taken = takeAdminFragment(location.hash);
  if (taken === null) return "none";
  // history.state carries the router's own entry bookkeeping; keep it.
  history.replaceState(
    history.state,
    "",
    `${location.pathname}${location.search}${taken.hash}`,
  );
  if (taken.token === null) return "malformed";
  const stored = loadAdminToken(boardId);
  if (stored !== null && stored !== taken.token) return "conflict";
  saveAdminToken(boardId, taken.token);
  return "adopted";
}
