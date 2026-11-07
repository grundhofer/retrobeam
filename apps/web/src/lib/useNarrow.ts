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

// A window of 1024 px and more: room for the phase names in the steps
// (PhaseStepper). Followed live, like useNarrow.
const WIDE = "(min-width: 1024px)";

function subscribeWide(onChange: () => void): () => void {
  if (typeof matchMedia === "undefined") return () => undefined;
  const list = matchMedia(WIDE);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function snapshotWide(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia(WIDE).matches;
}

export function useWide(): boolean {
  return useSyncExternalStore(subscribeWide, snapshotWide, () => false);
}
