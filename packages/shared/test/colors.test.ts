// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  assignColor,
  PARTICIPANT_COLORS,
  personColour,
} from "../src/domain/colors.js";

describe("assignColor", () => {
  it("hands out distinct colors until the palette is exhausted", () => {
    const taken: string[] = [];
    for (let i = 0; i < PARTICIPANT_COLORS.length; i++) {
      const color = assignColor(taken);
      expect(taken).not.toContain(color);
      taken.push(color);
    }
    expect(new Set(taken).size).toBe(PARTICIPANT_COLORS.length);
  });

  it("cycles deterministically once all colors are taken", () => {
    const taken = [...PARTICIPANT_COLORS];
    expect(assignColor(taken)).toBe(PARTICIPANT_COLORS[0]);
    expect(assignColor([...taken, "#000000"])).toBe(PARTICIPANT_COLORS[1]);
  });
});

// The ring around a person's initials (owner, 2026-11-20): one value per
// tone has to hold 3:1 against every ground of sebaro's four palettes.
describe("personColour", () => {
  const GROUNDS = [
    ...["#F4F5F8", "#FBFCFE", "#FFFFFF", "#E9EBEE"], // light
    ...["#13161C", "#1B1E24", "#212429", "#090C11"], // dark
    ...["#FBF4EA", "#FFFBF5", "#FFFFFB", "#F3EADC"], // warm
    ...["#1B140F", "#241C16", "#29221D", "#100B07"], // warm dark
  ];
  const channel = (hex: string, at: number) => {
    const c = parseInt(hex.slice(at, at + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex: string) =>
    0.2126 * channel(hex, 1) +
    0.7152 * channel(hex, 3) +
    0.0722 * channel(hex, 5);
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };

  it("every tone keeps 3:1 against every ground, light and dark", () => {
    for (const tone of PARTICIPANT_COLORS) {
      for (const ground of GROUNDS) {
        expect(contrast(tone, ground)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("draws the palette's own value, and moves an old one to its new place", () => {
    expect(personColour(PARTICIPANT_COLORS[3])).toBe(PARTICIPANT_COLORS[3]);
    // #E8B50C was the old seventh tone (1.74:1 on white).
    expect(personColour("#E8B50C")).toBe(PARTICIPANT_COLORS[6]);
    expect(personColour("#e8b50c")).toBe(PARTICIPANT_COLORS[6]);
    // Anything else lands on the palette, the same way every time.
    const stray = personColour("#123456");
    expect(PARTICIPANT_COLORS).toContain(stray);
    expect(personColour("#123456")).toBe(stray);
  });

  it("a board with old colours hands a newcomer a tone nobody is drawn in", () => {
    const taken = ["#E8590C", "#1971C2"]; // old first and second
    const next = assignColor(taken);
    expect(next).toBe(PARTICIPANT_COLORS[2]);
  });
});
