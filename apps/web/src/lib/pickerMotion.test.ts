// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  cardStage,
  riffleApart,
  slotOffset,
  slotReelEnd,
  wheelAngle,
  WHEEL_SETTLE_MS,
  WHEEL_WIND_MS,
} from "./pickerMotion.js";

describe("wheelAngle", () => {
  const duration = 5900;
  const target = 2000;
  it("winds back first, then turns past the target and settles on it", () => {
    expect(wheelAngle(0, duration, target)).toBe(0);
    expect(wheelAngle(WHEEL_WIND_MS, duration, target)).toBeLessThan(0);
    const beforeSettle = wheelAngle(
      duration - WHEEL_SETTLE_MS,
      duration,
      target,
    );
    expect(beforeSettle).toBeGreaterThan(target);
    expect(wheelAngle(duration, duration, target)).toBe(target);
    expect(wheelAngle(duration + 5000, duration, target)).toBe(target);
  });
  it("slows down towards the end", () => {
    const early =
      wheelAngle(1500, duration, target) - wheelAngle(1400, duration, target);
    const late =
      wheelAngle(5000, duration, target) - wheelAngle(4900, duration, target);
    expect(late).toBeLessThan(early);
  });
});

describe("slots", () => {
  it("the last reel stops last, at the end", () => {
    expect(slotReelEnd(4500, 0)).toBeLessThan(slotReelEnd(4500, 1));
    expect(slotReelEnd(4500, 2)).toBe(4500);
  });
  it("runs past the stop, comes back, and blurs only while fast", () => {
    const end = 4500;
    const final = -720;
    expect(slotOffset(100, end, final).blur).toBe(true);
    const past = slotOffset(end - 260, end, final).offset;
    expect(past).toBeLessThan(final);
    expect(slotOffset(end, end, final)).toEqual({ offset: final, blur: false });
  });
});

describe("cards", () => {
  it("goes gather → riffle → fan → lift → reveal", () => {
    const d = 3600;
    expect(cardStage(0, d)).toBe("gather");
    expect(cardStage(0.2 * d, d)).toBe("riffle");
    expect(cardStage(0.5 * d, d)).toBe("fan");
    expect(cardStage(0.7 * d, d)).toBe("lift");
    expect(cardStage(d, d)).toBe("reveal");
  });
  it("riffles apart and together twice", () => {
    const d = 3600;
    const at = (f: number) => riffleApart(f * d, d);
    expect([at(0.14), at(0.25), at(0.34), at(0.45)]).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });
});
