// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from "zod";

// "Who presents next" — the rotation is the product's unique feature: draw
// without replacement until everyone has presented. The server draws with a
// CSPRNG; every client replays the identical wheel animation from the
// broadcast seed, so all screens land on the same name.
export const pickerStateSchema = z.object({
  /** not yet presented (the wheel pool) */
  remaining: z.array(z.string()),
  /** finished presenting, in order */
  presented: z.array(z.string()),
  /** currently presenting */
  current: z.string().nullable(),
  /** deliberately taken off the wheel by the facilitator — reconnects and
   *  latecomer auto-adds must not undo this (defaulted for older boards) */
  excluded: z.array(z.string()).default([]),
  /** Authors whose cards the ROOM has already been shown in the current
   *  presenting round. A PRIVACY fact, not rotation bookkeeping — never
   *  conflate the two:
   *
   *  `presented` is what the wheel has completed, and it can go BACKWARDS.
   *  admin.picker.skip returns the current presenter to `remaining` without
   *  ever adding them here, so a visible set derived from (presented ∪ current)
   *  would make cards the room had already read go dark again — the server
   *  would have to un-send notes it had already broadcast, and there is no
   *  un-reveal event. Within a round this list only ever grows.
   *
   *  It is cleared at exactly one point: entering `present` from an unrevealed
   *  phase, which starts a new round. Every member's client has dropped foreign
   *  notes on the way into that phase already, so clearing takes nothing off
   *  any screen. (Defaulted [] for boards written before presenter-scoped
   *  visibility; a board that was mid-round when this shipped is opened once
   *  by the schemaVersion 2 migration rather than guessed at on every read.) */
  revealed: z.array(z.string()).default([]),
  /** The round has handed the whole board over: everyone sees everything.
   *  Latched rather than recomputed, because every predicate that could
   *  express it is retractable — `rotationExhausted` goes false again the
   *  moment a latecomer is appended to `remaining`, and `pickerFinished` is
   *  false for a room where everybody was excluded. It is latched on the way
   *  OUT of `present` too, so a vote→present rewind cannot re-narrow a board
   *  the room is already reading. (Defaulted false for older boards.) */
  revealedAll: z.boolean().default(false),
});
export type PickerState = z.infer<typeof pickerStateSchema>;

export const EMPTY_PICKER: PickerState = {
  remaining: [],
  presented: [],
  current: null,
  excluded: [],
  revealed: [],
  revealedAll: false,
};

export function pickerFinished(picker: PickerState): boolean {
  return (
    picker.remaining.length === 0 &&
    picker.current === null &&
    picker.presented.length > 0
  );
}

export function pickerKnows(
  picker: PickerState,
  participantId: string,
): boolean {
  return (
    picker.current === participantId ||
    picker.remaining.includes(participantId) ||
    picker.presented.includes(participantId) ||
    picker.excluded.includes(participantId)
  );
}

// Authors the room has already been shown this round.
//
// Deliberately NOT folding in `presented` and `current`. Both survive a rewind
// out of the presenting phase and back (a documented property of the
// rotation), so a set derived from them could never be cleared — the second
// round on a board would start with everybody's new cards already visible,
// which is the very thing the round reset exists to prevent. A board written
// before this field is handled once, by the schemaVersion 2 migration, not by
// guessing on every read.
export function revealedAuthors(picker: PickerState): ReadonlySet<string> {
  return new Set(picker.revealed);
}

// The rotation can put nobody new on stage: nobody waiting, nobody holding the
// mic. Deliberately NOT pickerFinished, which additionally requires that
// somebody actually presented because it drives the confetti. For visibility
// the celebration is irrelevant: if nothing can still be staged there is
// nothing left to withhold, and a room whose facilitator excluded everyone
// would otherwise never see a single card.
export function rotationExhausted(picker: PickerState): boolean {
  return picker.remaining.length === 0 && picker.current === null;
}

// Append-only. Returns the SAME object when nothing changed, so a caller can
// skip the persist and the fan-out on a reference check.
export function withPresenterRevealed(
  picker: PickerState,
  participantId: string,
): PickerState {
  if (picker.revealed.includes(participantId)) return picker;
  return { ...picker, revealed: [...picker.revealed, participantId] };
}

// Latches the whole-board reveal. One-way for the life of the round.
export function withAllRevealed(picker: PickerState): PickerState {
  return picker.revealedAll ? picker : { ...picker, revealedAll: true };
}

export const WHEEL_SPIN_MS = 4500;
/** lead time between the server timestamp and the animation start */
export const WHEEL_START_DELAY_MS = 300;
/** how long the winner card stays up after the wheel stops */
export const WHEEL_HOLD_MS = 2600;

// The spin every client replays; also included in sync snapshots while still
// active, so a reconnect mid-spin does not kill the wheel.
export const wheelSpinSchema = z.object({
  pool: z.array(z.string()),
  winnerId: z.string(),
  seed: z.number(),
  startAt: z.number(),
  durationMs: z.number(),
});
export type WheelSpin = z.infer<typeof wheelSpinSchema>;

// Tiny deterministic PRNG — all animation randomness (turn count, in-segment
// jitter) derives from the broadcast seed, never from local Math.random().
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Final clockwise wheel rotation (degrees) that parks the winner's segment
// under the pointer at the top. Segments are laid out in pool order starting
// at the top, clockwise. Deterministic: same pool/winner/seed → same spin.
export function wheelTargetRotation(
  pool: readonly string[],
  winnerId: string,
  seed: number,
): number {
  const count = pool.length;
  const index = pool.indexOf(winnerId);
  if (count === 0 || index === -1) return 0;
  const random = mulberry32(seed);
  const fullTurns = 4 + Math.floor(random() * 3); // 4–6 turns of anticipation
  const segment = 360 / count;
  const winnerCenter = index * segment + segment / 2;
  // organic near-misses only: jitter stays well inside the segment
  const jitter = (random() - 0.5) * segment * 0.7;
  return fullTurns * 360 + (360 - winnerCenter) + jitter;
}

// Alternative picker skin: a slot machine. Same server draw, same seed — only
// the visual differs, so the drawn winner is identical to the wheel.
export const pickerStyles = ["wheel", "slots"] as const;
export type PickerStyle = (typeof pickerStyles)[number];

export const SLOT_REELS = 3;
const SLOT_REEL_REPEATS = 8;

// One slot reel's strip (participant ids top→bottom) plus the strip index the
// reel parks on — that index is always the winner (jackpot: every reel matches).
// Deterministic from (seed, reelIndex): each reel is the pool repeated with a
// seed-derived rotation for filler variety, so all reels land on the winner
// while showing different symbols on the way down. Rows are left below the stop
// index for the "peek" of the next symbols. Same inputs → same strip on every
// client (no local Math.random), so a mid-spin reconnect stays in lockstep.
export function slotReel(
  pool: readonly string[],
  winnerId: string,
  seed: number,
  reelIndex: number,
): { strip: string[]; stopIndex: number } {
  const n = pool.length;
  if (n === 0 || pool.indexOf(winnerId) === -1) {
    return { strip: [], stopIndex: 0 };
  }
  const random = mulberry32((seed ^ ((reelIndex + 1) * 0x9e3779b1)) >>> 0);
  const rotation = Math.floor(random() * n);
  const rotated = pool.map((_, i) => pool[(i + rotation) % n] as string);
  const strip: string[] = [];
  for (let r = 0; r < SLOT_REEL_REPEATS; r++) strip.push(...rotated);
  // Park two pool-lengths from the bottom so following symbols peek below.
  const stopIndex = (SLOT_REEL_REPEATS - 2) * n + rotated.indexOf(winnerId);
  return { strip, stopIndex };
}
