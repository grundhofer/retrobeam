// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
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

  async function copy(kind: BoardCopyKind, name: string): Promise<void> {
    if (copying !== null) return;
    const token = loadAdminToken(boardId);
    if (token === null) return;
    setCopying(kind);
    setFailed(false);
    try {
      // "Folge-Retro: <a 55-character name>" would be refused by the server's
      // name limit; cut the localized name down rather than fail the copy.
      const fitted = name.slice(0, boardNameSchema.maxLength ?? 60).trim();
      const create = kind === "duplicate" ? duplicateBoard : followUpBoard;
      const created = await create(boardId, fitted, token);
      saveAdminToken(created.boardId, created.adminToken);
      void navigate(`/board/${created.boardId}`);
    } catch {
      // stay put; the button remains usable to retry
      setCopying(null);
      setFailed(true);
    }
  }

  return { copying, failed, copy };
}
