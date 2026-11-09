// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

// The choosing moment's motion as pure functions of the time since the
// server's start (owner, 2026-11-09: wheel „Spannung“, slots „Walzen“, cards
// „Mischen“). Every screen computes the same frame from the same clock, so the
// room sees one spin, and a screen that joins mid-spin lands in the right
// place. Under reduced motion nothing of this runs (SpinScene shows the name).

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export const easeOutQuint = (p: number) => 1 - Math.pow(1 - clamp01(p), 5);
export const easeInOut = (p: number) => {
  const q = clamp01(p);
  return q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
};

// --- wheel: wind up, spin, crawl, overshoot, settle ----------------------
export const WHEEL_WIND_MS = 320;
export const WHEEL_SETTLE_MS = 380;
const WHEEL_WIND_DEG = -14;
const WHEEL_OVERSHOOT_DEG = 4;

/** The disc's rotation (degrees) at `elapsed` ms of a `duration` ms spin
 *  that rests at `target`. */
export function wheelAngle(
  elapsed: number,
  duration: number,
  target: number,
): number {
  if (elapsed <= 0) return 0;
  if (elapsed >= duration) return target;
  if (elapsed < WHEEL_WIND_MS) {
    return WHEEL_WIND_DEG * easeInOut(elapsed / WHEEL_WIND_MS);
  }
  const spinEnd = duration - WHEEL_SETTLE_MS;
  if (elapsed < spinEnd) {
    const p = (elapsed - WHEEL_WIND_MS) / (spinEnd - WHEEL_WIND_MS);
    return (
      WHEEL_WIND_DEG +
      (target + WHEEL_OVERSHOOT_DEG - WHEEL_WIND_DEG) * easeOutQuint(p)
    );
  }
  const p = (elapsed - spinEnd) / WHEEL_SETTLE_MS;
  return target + WHEEL_OVERSHOOT_DEG * (1 - easeInOut(p));
}

// --- slots: blur while fast, staggered stops, the last reel lingers -------
export const SLOT_BOUNCE_MS = 260;
const SLOT_OVERSHOOT_PX = 10;
/** When each reel comes to rest, counted back from the spin's end: the first
 *  two stop together-ish, the last one keeps the room waiting. */
export const SLOT_STOP_BEFORE_END_MS = [1700, 1000, 0] as const;

export function slotReelEnd(duration: number, reel: number): number {
  const before = SLOT_STOP_BEFORE_END_MS[reel] ?? 0;
  return Math.max(SLOT_BOUNCE_MS + 1, duration - before);
}

/** A reel's offset (px, negative = scrolled down) and whether it is still
 *  fast enough to blur. */
export function slotOffset(
  elapsed: number,
  reelEnd: number,
  finalOffset: number,
): { offset: number; blur: boolean } {
  if (elapsed <= 0) return { offset: 0, blur: false };
  if (elapsed >= reelEnd) return { offset: finalOffset, blur: false };
  const runEnd = reelEnd - SLOT_BOUNCE_MS;
  // past the stop by a few pixels, then back: the reel „catches“
  const overshoot =
    finalOffset + SLOT_OVERSHOOT_PX * Math.sign(finalOffset || -1);
  if (elapsed < runEnd) {
    const p = elapsed / runEnd;
    return { offset: overshoot * easeOutQuint(p), blur: p < 0.8 };
  }
  const p = (elapsed - runEnd) / SLOT_BOUNCE_MS;
  return {
    offset: overshoot + (finalOffset - overshoot) * easeInOut(p),
    blur: false,
  };
}

// --- cards: gather, riffle twice, fan out, lift the chosen one, flip ------
export type CardStage = "gather" | "riffle" | "fan" | "lift" | "reveal";
/** The stages' start times as fractions of the reveal's duration. */
const CARD_STAGES: ReadonlyArray<readonly [CardStage, number]> = [
  ["gather", 0],
  ["riffle", 0.12],
  ["fan", 0.48],
  ["lift", 0.66],
  ["reveal", 0.78],
];

export function cardStage(elapsed: number, duration: number): CardStage {
  const p = elapsed / Math.max(1, duration);
  let stage: CardStage = "gather";
  for (const [name, from] of CARD_STAGES) if (p >= from) stage = name;
  return stage;
}

/** While riffling, which half of the riffle is showing: apart, then together,
 *  twice. */
export function riffleApart(elapsed: number, duration: number): boolean {
  const from = 0.12 * duration;
  const span = (0.48 - 0.12) * duration;
  const quarter = Math.floor(((elapsed - from) / span) * 4);
  return quarter === 0 || quarter === 2;
}

export function cardStageStarts(duration: number): number[] {
  return CARD_STAGES.map(([, from]) => from * duration);
}
