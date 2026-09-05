// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { ICEBREAKER_IDS, pickIcebreaker } from "../src/domain/icebreakers.js";

describe("pickIcebreaker", () => {
  it("returns a member of the bank for any index", () => {
    for (const index of [0, 1, 7, 23, 100, 999]) {
      expect(ICEBREAKER_IDS).toContain(pickIcebreaker(index));
    }
  });

  it("never repeats the avoided question", () => {
    for (const avoid of ICEBREAKER_IDS) {
      for (let i = 0; i < ICEBREAKER_IDS.length + 3; i++) {
        expect(pickIcebreaker(i, avoid)).not.toBe(avoid);
      }
    }
  });

  it("is deterministic for a given index", () => {
    expect(pickIcebreaker(5)).toBe(pickIcebreaker(5));
  });

  // The caller draws the index; a fair shuffle therefore requires the caller to
  // draw over the POOL, not the whole bank. Drawing 0..23 while avoiding one
  // question folds index 23 back onto the first option, doubling its odds.
  it("maps one index per option when the index spans exactly the pool", () => {
    expect(new Set(ICEBREAKER_IDS.map((_, i) => pickIcebreaker(i))).size).toBe(
      ICEBREAKER_IDS.length,
    );
    for (const avoid of ICEBREAKER_IDS) {
      const poolSize = ICEBREAKER_IDS.length - 1;
      const drawn = Array.from({ length: poolSize }, (_, i) =>
        pickIcebreaker(i, avoid),
      );
      expect(new Set(drawn).size).toBe(poolSize);
    }
  });
});
