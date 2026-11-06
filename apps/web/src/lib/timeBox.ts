// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Timer } from "@retrobeam/shared";

// sebaro's time box (spec/02 §3.29 RB-1, spec/07 „The remaining time of a
// timebox“, owner D104 (8)): the remaining time as words in whole minutes,
// counted up to the next one, so the last minute says „noch 1 Min.“ until the time is over;
// then „Zeit um“, and nothing locks. No seconds, no colour, no sound — a calm
// remaining time, not a pressure countdown.
export type TimeBox =
  | { kind: "idle" }
  | { kind: "running"; minutes: number }
  | { kind: "paused"; minutes: number }
  | { kind: "up" };

export function timeBox(timer: Timer, serverNow: number): TimeBox {
  if (timer.pausedRemainingMs !== null) {
    return {
      kind: "paused",
      minutes: Math.max(1, Math.ceil(timer.pausedRemainingMs / 60_000)),
    };
  }
  if (timer.endsAt === null) return { kind: "idle" };
  const remaining = timer.endsAt - serverNow;
  if (remaining <= 0) return { kind: "up" };
  return { kind: "running", minutes: Math.ceil(remaining / 60_000) };
}
