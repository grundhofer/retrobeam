// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  EMPTY_PICKER,
  mulberry32,
  pickerFinished,
  pickerKnows,
  pickerStateSchema,
  revealedAuthors,
  rotationExhausted,
  SLOT_REELS,
  slotReel,
  wheelTargetRotation,
  withAllRevealed,
  withPresenterRevealed,
  type PickerState,
} from "../src/domain/picker.js";

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
    expect(new Set(seqA).size).toBe(3);
  });

  it("stays within [0, 1)", () => {
    const random = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("wheelTargetRotation", () => {
  const pool = ["anna", "ben", "cara", "dev"];

  it("is deterministic: same inputs, same rotation on every client", () => {
    expect(wheelTargetRotation(pool, "cara", 777)).toBe(
      wheelTargetRotation(pool, "cara", 777),
    );
  });

  it("parks the winner's segment under the pointer", () => {
    for (const [winner, seed] of [
      ["anna", 1],
      ["ben", 99],
      ["cara", 12345],
      ["dev", 987654],
    ] as const) {
      const rotation = wheelTargetRotation(pool, winner, seed);
      const segment = 360 / pool.length;
      const index = pool.indexOf(winner);
      // final wheel angle mod 360; the pointer sits at 0° (top)
      const landed = ((rotation % 360) + 360) % 360;
      const pointerPosition = (360 - landed) % 360; // which wheel angle is at the pointer
      const segmentStart = index * segment;
      expect(pointerPosition).toBeGreaterThan(segmentStart);
      expect(pointerPosition).toBeLessThan(segmentStart + segment);
    }
  });

  it("spins at least four full turns for anticipation", () => {
    expect(wheelTargetRotation(pool, "anna", 5)).toBeGreaterThanOrEqual(
      4 * 360,
    );
  });

  it("degrades safely for unknown winners or empty pools", () => {
    expect(wheelTargetRotation([], "anna", 1)).toBe(0);
    expect(wheelTargetRotation(pool, "nobody", 1)).toBe(0);
  });
});

describe("slotReel", () => {
  const pool = ["anna", "ben", "cara", "dev"];

  it("every reel parks on the winner (jackpot) — deterministically from the seed", () => {
    for (const [winner, seed] of [
      ["anna", 1],
      ["ben", 99],
      ["cara", 12345],
      ["dev", 987654],
    ] as const) {
      for (let reel = 0; reel < SLOT_REELS; reel++) {
        const a = slotReel(pool, winner, seed, reel);
        const b = slotReel(pool, winner, seed, reel);
        expect(a).toEqual(b); // same inputs → same strip on every client
        expect(a.strip[a.stopIndex]).toBe(winner);
        // the stop leaves following symbols below it for the peek row
        expect(a.stopIndex).toBeLessThan(a.strip.length - 1);
      }
    }
  });

  it("reels vary in filler order (not identical strips) for most seeds", () => {
    // Deterministic but robust: over a fixed range of seeds, the great majority
    // produce at least two distinct reel strips (visual variety), while every
    // reel always still lands on the winner.
    let varied = 0;
    for (let seed = 0; seed < 50; seed++) {
      const strips = Array.from({ length: SLOT_REELS }, (_, i) => {
        const r = slotReel(pool, "cara", seed, i);
        expect(r.strip[r.stopIndex]).toBe("cara");
        return r.strip.join(",");
      });
      if (new Set(strips).size > 1) varied++;
    }
    expect(varied).toBeGreaterThan(40);
  });

  it("degrades safely for a single-person pool and unknown winners", () => {
    const solo = slotReel(["anna"], "anna", 1, 0);
    expect(solo.strip[solo.stopIndex]).toBe("anna");
    expect(slotReel([], "anna", 1, 0)).toEqual({ strip: [], stopIndex: 0 });
    expect(slotReel(pool, "nobody", 1, 0)).toEqual({ strip: [], stopIndex: 0 });
  });
});

describe("picker state helpers", () => {
  it("pickerFinished only after at least one person presented", () => {
    expect(pickerFinished(EMPTY_PICKER)).toBe(false);
    expect(
      pickerFinished({
        ...EMPTY_PICKER,
        presented: ["anna"],
      }),
    ).toBe(true);
    expect(
      pickerFinished({
        ...EMPTY_PICKER,
        remaining: ["ben"],
        presented: ["anna"],
      }),
    ).toBe(false);
    expect(
      pickerFinished({
        ...EMPTY_PICKER,
        presented: ["anna"],
        current: "ben",
      }),
    ).toBe(false);
  });

  it("pickerKnows covers all three buckets", () => {
    const picker = {
      ...EMPTY_PICKER,
      remaining: ["anna"],
      presented: ["ben"],
      current: "cara",
      excluded: ["dev"],
    };
    expect(pickerKnows(picker, "anna")).toBe(true);
    expect(pickerKnows(picker, "ben")).toBe(true);
    expect(pickerKnows(picker, "cara")).toBe(true);
    expect(pickerKnows(picker, "dev")).toBe(true); // excluded is still "known"
    expect(pickerKnows(picker, "elle")).toBe(false);
  });
});

describe("presenter reveal bookkeeping", () => {
  it("tracks who the room has been shown, separately from the rotation", () => {
    // `presented` can go backwards — a skip returns the current presenter to
    // the pool without ever adding them to it. `revealed` is what the room has
    // actually read, and it never shrinks inside a round.
    const staged = withPresenterRevealed(
      { ...EMPTY_PICKER, remaining: ["ben"], current: "anna" },
      "anna",
    );
    expect(revealedAuthors(staged)).toEqual(new Set(["anna"]));
    const skipped = { ...staged, remaining: ["ben", "anna"], current: null };
    expect(revealedAuthors(skipped)).toEqual(new Set(["anna"]));
  });

  it("does not infer a reveal from the rotation's own bookkeeping", () => {
    // Both survive a rewind out of the presenting phase, so a set derived from
    // them could never be cleared and a second round would start wide open.
    const midRound: PickerState = {
      ...EMPTY_PICKER,
      presented: ["ben"],
      current: "cara",
    };
    expect(revealedAuthors(midRound)).toEqual(new Set());
  });

  it("appending an author already shown returns the same object", () => {
    const picker = { ...EMPTY_PICKER, revealed: ["anna"] };
    expect(withPresenterRevealed(picker, "anna")).toBe(picker);
  });

  it("rotationExhausted covers the room where everybody was excluded", () => {
    const allExcluded: PickerState = {
      ...EMPTY_PICKER,
      excluded: ["anna", "ben"],
    };
    // pickerFinished is false here — it wants somebody to celebrate. For
    // visibility that is irrelevant: nothing can be staged, so nothing is left
    // to withhold.
    expect(pickerFinished(allExcluded)).toBe(false);
    expect(rotationExhausted(allExcluded)).toBe(true);
    expect(rotationExhausted({ ...EMPTY_PICKER, remaining: ["anna"] })).toBe(
      false,
    );
  });

  it("latches the whole-board reveal one way", () => {
    const opened = withAllRevealed(EMPTY_PICKER);
    expect(opened.revealedAll).toBe(true);
    expect(withAllRevealed(opened)).toBe(opened);
  });

  it("defaults both fields for a board written before they existed", () => {
    const legacy = pickerStateSchema.parse({
      remaining: ["anna"],
      presented: [],
      current: null,
    });
    expect(legacy.revealed).toEqual([]);
    expect(legacy.revealedAll).toBe(false);
  });
});
