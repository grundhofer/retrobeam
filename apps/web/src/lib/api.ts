// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { boardInfoSchema, type BoardInfo } from "@retropolis/shared";
import { z } from "zod";

const createBoardResponseSchema = z.object({
  boardId: z.string(),
  adminToken: z.string(),
});

export async function createBoard(
  name: string,
  template: string,
  locale: string,
  layout: "columns" | "canvas" = "columns",
): Promise<{ boardId: string; adminToken: string }> {
  const response = await fetch("/api/boards", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, template, locale, layout }),
  });
  if (!response.ok) throw new Error(`create board failed: ${response.status}`);
  return createBoardResponseSchema.parse(await response.json());
}

// Duplicate a board's structure (columns/config/agreements) into a fresh
// board. Gated server-side on the source admin token; returns the new board's
// id + admin token. No notes/votes/participants carry over.
export async function duplicateBoard(
  sourceId: string,
  name: string,
  adminToken: string,
): Promise<{ boardId: string; adminToken: string }> {
  const response = await fetch(`/api/boards/${sourceId}/duplicate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, adminToken }),
  });
  if (!response.ok) {
    throw new Error(`duplicate board failed: ${response.status}`);
  }
  return createBoardResponseSchema.parse(await response.json());
}

/** "This board does not exist" and "we could not ask" are different answers and
 *  need different screens: the first is final, the second is worth retrying.
 *  Collapsing them showed a confident "Board not found" to someone whose wifi
 *  had dropped — and invited them to abandon a board that was fine. */
export type BoardLookup =
  | { status: "ok"; board: BoardInfo }
  | { status: "missing" }
  | { status: "error" };

export async function fetchBoardInfo(boardId: string): Promise<BoardLookup> {
  try {
    const response = await fetch(`/api/boards/${boardId}`);
    if (response.status === 404) return { status: "missing" };
    if (!response.ok) return { status: "error" };
    const data = z
      .object({ board: boardInfoSchema })
      .parse(await response.json());
    return { status: "ok", board: data.board };
  } catch {
    // Offline, DNS, a parse failure — all "ask again later", never "gone".
    return { status: "error" };
  }
}
