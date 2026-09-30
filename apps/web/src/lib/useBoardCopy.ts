// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { boardNameSchema } from "@retrobeam/shared";
import { duplicateBoard, followUpBoard } from "./api.js";
import { loadAdminToken, saveAdminToken } from "./session.js";

export type BoardCopyKind = "duplicate" | "follow-up";

// The two ways a facilitator starts a new board from this one: a duplicate
// (structure only) and a follow-up retro (structure plus the open Action
// Items). Both are gated on the admin token this browser holds, store the new
// board's token, and navigate there — one path, shared by the board menu and
// the results page, so the two entry points cannot drift apart.
export function useBoardCopy(boardId: string): {
  copying: BoardCopyKind | null;
  failed: boolean;
  copy: (kind: BoardCopyKind, name: string) => Promise<void>;
} {
  const navigate = useNavigate();
  const [copying, setCopying] = useState<BoardCopyKind | null>(null);
  const [failed, setFailed] = useState(false);
  // State alone does not stop a double-click: both clicks can run before the
  // re-render that disables the button, and each would mint a board. The ref
  // is set synchronously, so the second click sees it.
  const inFlight = useRef(false);

  async function copy(kind: BoardCopyKind, name: string): Promise<void> {
    if (inFlight.current) return;
    const token = loadAdminToken(boardId);
    if (token === null) return;
    inFlight.current = true;
    setCopying(kind);
    setFailed(false);
    try {
      // "Folge-Retro: <a 55-character name>" would be refused by the server's
      // name limit; cut the localized name down rather than fail the copy.
      const fitted = fitName(name, boardNameSchema.maxLength ?? 60);
      const create = kind === "duplicate" ? duplicateBoard : followUpBoard;
      const created = await create(boardId, fitted, token);
      saveAdminToken(created.boardId, created.adminToken);
      void navigate(`/board/${created.boardId}`);
    } catch {
      // stay put; the button remains usable to retry
      inFlight.current = false;
      setCopying(null);
      setFailed(true);
    }
  }

  return { copying, failed, copy };
}

/** Cut to at most `max` UTF-16 units (the unit zod's .max counts) without
 *  splitting a character: slicing by units could leave half an emoji — a lone
 *  surrogate the server would store and every screen would draw as "�". */
export function fitName(name: string, max: number): string {
  let fitted = "";
  for (const char of name) {
    if (fitted.length + char.length > max) break;
    fitted += char;
  }
  return fitted.trim();
}
