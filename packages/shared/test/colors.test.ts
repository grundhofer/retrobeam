// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  assignTone,
  LEGACY_TONE_COLOURS,
  legacyColourForTone,
  PERSON_TONE_COUNT,
  toneFromColour,
} from "../src/domain/colors.js";

// sebaro's person tones (FAR-16, v3.1.2): the contrast of the colours is
// sebaro's to keep; what stays here is the order and the old values.
describe("assignTone", () => {
  it("hands out the tones in order until all twelve are taken", () => {
    const taken: number[] = [];
    for (let i = 0; i < PERSON_TONE_COUNT; i++) taken.push(assignTone(taken));
    expect(taken).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("fills a gap first, then starts the order again", () => {
    expect(assignTone([1, 3])).toBe(2);
    const all = Array.from({ length: PERSON_TONE_COUNT }, (_, i) => i + 1);
    expect(assignTone(all)).toBe(1);
    expect(assignTone([...all, 1])).toBe(2);
  });
});

describe("toneFromColour", () => {
  it("gives a colour stored before tones the tone at its place", () => {
    expect(toneFromColour(LEGACY_TONE_COLOURS[0])).toBe(1);
    expect(toneFromColour("#8766d2")).toBe(4);
    // The palette before 2026-11-20: #E8B50C was its seventh.
    expect(toneFromColour("#E8B50C")).toBe(7);
  });

  it("folds anything else onto the tones, the same way every time", () => {
    const stray = toneFromColour("#123456");
    expect(stray).toBeGreaterThanOrEqual(1);
    expect(stray).toBeLessThanOrEqual(PERSON_TONE_COUNT);
    expect(toneFromColour("#123456")).toBe(stray);
  });

  it("sends the colour an old tab drew for the same tone", () => {
    for (let tone = 1; tone <= PERSON_TONE_COUNT; tone++) {
      expect(toneFromColour(legacyColourForTone(tone))).toBe(tone);
    }
  });
});
