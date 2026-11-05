// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useSyncExternalStore } from "react";

// A window under 640 px: sebaro's phone width, where the board swipes its
// columns (sb-board.js). Followed live, so turning a tablet changes it.
const QUERY = "(max-width: 639.98px)";

function subscribe(onChange: () => void): () => void {
  if (typeof matchMedia === "undefined") return () => undefined;
  const list = matchMedia(QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function snapshot(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia(QUERY).matches;
}

export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
