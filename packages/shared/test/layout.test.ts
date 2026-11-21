// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  boardSurface,
  clampUnit,
  scatterPos,
  type LayoutMode,
} from "../src/domain/layout.js";
import { PHASES, type Phase } from "../src/domain/phases.js";

describe("boardSurface", () => {
  it("column boards always render columns", () => {
    for (const phase of PHASES) {
      expect(boardSurface("columns", phase, false, false, false, false)).toBe(
        "columns",
      );
      expect(boardSurface("columns", phase, true, false, false, false)).toBe(
        "columns",
      );
    }
  });

  it("canvas boards only show the raw canvas while writing or between presenters", () => {
    expect(boardSurface("canvas", "write", false, false, false, false)).toBe(
      "canvas",
    );
    // present with nobody on stage = calm overview; with a presenter = reader
    expect(boardSurface("canvas", "present", false, false, false, false)).toBe(
      "canvas",
    );
    expect(boardSurface("canvas", "present", true, false, false, false)).toBe(
      "focus",
    );
  });

  it("focus mode puts ANY board with someone on stage on the centred reader", () => {
    // The switch exists for a shared screen: one card at a time, columns board
    // or canvas. It only bites while somebody actually holds the mic.
    expect(boardSurface("columns", "present", true, true, false, false)).toBe(
      "focus",
    );
    expect(boardSurface("canvas", "present", true, true, false, false)).toBe(
      "focus",
    );
    // Once the round is over (or the board was handed over) the room reads
    // the whole board again.
    expect(boardSurface("columns", "present", false, true, false, false)).toBe(
      "columns",
    );
    expect(boardSurface("canvas", "present", false, true, false, false)).toBe(
      "canvas",
    );
    // …and never outside the presenting round, where the reader has no subject.
    expect(boardSurface("columns", "discuss", true, true, false, false)).toBe(
      "columns",
    );
    expect(boardSurface("canvas", "write", false, true, false, false)).toBe(
      "canvas",
    );
  });

  it("an anonymous board never reaches the presenter reader", () => {
    // The reader picks cards by author, and anonymity strips authorship from
    // every foreign note — routing a member there is a blank screen. This also
    // covers the canvas path, which reached "focus" without focus mode at all.
    expect(boardSurface("canvas", "present", true, false, true, false)).toBe(
      "canvas",
    );
    expect(boardSurface("canvas", "present", true, true, true, false)).toBe(
      "canvas",
    );
    expect(boardSurface("columns", "present", true, true, true, false)).toBe(
      "columns",
    );
    // Nor the stage between two people: there is no rotation to wait for.
    expect(boardSurface("columns", "present", false, true, true, true)).toBe(
      "columns",
    );
    expect(boardSurface("canvas", "present", false, true, true, true)).toBe(
      "canvas",
    );
  });

  it("focus mode keeps a stage between two people instead of the board", () => {
    // Before the first draw, while a draw is turning, and after „Fertig mit
    // Vorstellen“ nobody is on stage — the board used to flash up in full
    // there, on the screen the room is watching (owner, 2026-11-20).
    for (const layout of ["columns", "canvas"] as const) {
      expect(boardSurface(layout, "present", false, true, false, true)).toBe(
        "between",
      );
      // Without focus mode nothing changes.
      expect(boardSurface(layout, "present", false, false, false, true)).toBe(
        layout,
      );
    }
    // Someone on stage still wins.
    expect(boardSurface("columns", "present", true, true, false, true)).toBe(
      "focus",
    );
    // Only ever while presenting.
    for (const phase of PHASES.filter((p) => p !== "present")) {
      expect(boardSurface("columns", phase, false, true, false, true)).toBe(
        "columns",
      );
    }
  });

  it("canvas boards route read/vote/discuss phases to the structured columns", () => {
    const structured: Phase[] = ["vote", "discuss", "close", "done", "lobby"];
    for (const phase of structured) {
      expect(boardSurface("canvas", phase, false, false, false, false)).toBe(
        "columns",
      );
      expect(boardSurface("canvas", phase, true, false, false, false)).toBe(
        "columns",
      );
    }
  });
});

describe("clampUnit", () => {
  it("clamps into [0,1] and defaults NaN to the centre", () => {
    expect(clampUnit(-0.3)).toBe(0);
    expect(clampUnit(1.7)).toBe(1);
    expect(clampUnit(0.42)).toBeCloseTo(0.42);
    expect(clampUnit(Number.NaN)).toBe(0.5);
  });
});

describe("scatterPos", () => {
  it("is deterministic and in-bounds", () => {
    const ids = ["a".repeat(32), "b".repeat(32), "deadbeef".repeat(4)];
    for (const id of ids) {
      const a = scatterPos(id);
      const b = scatterPos(id);
      expect(a).toEqual(b); // same id → same spot
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x).toBeLessThanOrEqual(1);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeLessThanOrEqual(1);
    }
  });

  it("spreads different ids apart", () => {
    const p1 = scatterPos("a".repeat(32));
    const p2 = scatterPos("b".repeat(32));
    expect(p1).not.toEqual(p2);
  });
});

// The union stays exhaustive against the schema enum.
const _modes: LayoutMode[] = ["columns", "canvas"];
