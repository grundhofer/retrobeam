// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { create } from "zustand";
import {
  applyServerEvent,
  initialBoardState,
  type ClientBoardState,
  type ServerEvent,
} from "@retrobeam/shared";
import type { ConnectionStatus } from "../lib/socket.js";

/** A message shown once and then forgotten — a refused command, a degraded
 *  service. Not board state: it never survives a resync and never syncs to
 *  anyone else. */
export interface Notice {
  id: number;
  /** i18n key, already namespaced (e.g. "reject.PHASE_LOCKED"). */
  key: string;
  tone: "error" | "warning";
}

interface BoardStore {
  state: ClientBoardState;
  status: ConnectionStatus;
  notices: Notice[];
  /** serverNow - clientNow, captured when sync/timer events arrive; the timer
   *  renders off the server clock. */
  clockOffsetMs: number;
  dispatch: (event: ServerEvent) => void;
  setStatus: (status: ConnectionStatus) => void;
  setClockOffset: (offsetMs: number) => void;
  notify: (key: string, tone?: Notice["tone"]) => void;
  dismiss: (id: number) => void;
  reset: () => void;
}

let noticeId = 0;

// Server events flow through the shared reducer — the store itself holds no
// board logic (architecture doc §3: the React app is a thin renderer).
export const useBoardStore = create<BoardStore>()((set) => ({
  state: initialBoardState,
  status: "connecting",
  notices: [],
  clockOffsetMs: 0,
  dispatch: (event) =>
    set((store) => ({ state: applyServerEvent(store.state, event) })),
  setStatus: (status) => set({ status }),
  setClockOffset: (clockOffsetMs) => set({ clockOffsetMs }),
  notify: (key, tone = "error") =>
    set((store) =>
      // One notice per kind at a time: a refused burst (a vote budget hit three
      // times in a row) should read as one explanation, not a stack.
      store.notices.some((n) => n.key === key)
        ? store
        : { notices: [...store.notices, { id: ++noticeId, key, tone }] },
    ),
  dismiss: (id) =>
    set((store) => ({ notices: store.notices.filter((n) => n.id !== id) })),
  reset: () =>
    set({
      state: initialBoardState,
      status: "connecting",
      notices: [],
      clockOffsetMs: 0,
    }),
}));
