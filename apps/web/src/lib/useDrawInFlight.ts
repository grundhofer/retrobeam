// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useCallback, useSyncExternalStore } from "react";
import { drawInFlight } from "@retrobeam/shared";
import { useBoardStore } from "../store/boardStore.js";
import { motionReduced } from "./motion.js";

// The winner of a draw that is still turning on this screen, or null. The
// board reads it to hold back who was drawn until the wheel lands (owner,
// 2026-11-20): the server sends the winner and their cards with the spin.
//
// A boolean snapshot, not the clock, and one timer to the landing instead of
// a tick: the page re-renders when the draw lands and at no other time.
// `lastSpin` outlives the spin, so a tick would run all through the round.
export function useDrawInFlight(): string | null {
  const spin = useBoardStore((store) => store.state.lastSpin);
  const clockOffsetMs = useBoardStore((store) => store.clockOffsetMs);
  const landsAt =
    spin === null ? 0 : spin.startAt - clockOffsetMs + spin.durationMs;
  const subscribe = useCallback(
    (onChange: () => void) => {
      const wait = landsAt - Date.now();
      if (wait <= 0) return () => undefined;
      const timer = setTimeout(onChange, wait + 1);
      return () => clearTimeout(timer);
    },
    [landsAt],
  );
  // A still scene (the system's setting or sebaro's switch, as the overlay
  // reads it) lands at once: the board must not wait for a wheel nobody sees.
  const turning = useSyncExternalStore(subscribe, () =>
    drawInFlight(spin, Date.now(), clockOffsetMs, motionReduced()),
  );
  return turning && spin !== null ? spin.winnerId : null;
}

// Whose cards to keep off this screen until the draw lands: the winner's, for
// everyone who could not read them before it. A facilitator holds the whole
// board during the round anyway, your own cards are yours, and once the board
// was handed over everyone could read them already. A winner who was skipped
// and drawn again had their cards out before; they step back for the length
// of the turn, which costs a flicker and reveals nothing.
export function heldDuringDraw(
  drawing: string | null,
  viewer: { id: string | undefined; isAdmin: boolean },
  revealedAll: boolean,
): string | null {
  if (drawing === null || viewer.isAdmin || revealedAll) return null;
  return drawing === viewer.id ? null : drawing;
}
