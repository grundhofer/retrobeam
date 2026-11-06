// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { IDLE_TIMER } from "@retrobeam/shared";
import { timeBox } from "./timeBox.js";

const at = (
  endsAt: number | null,
  pausedRemainingMs: number | null = null,
) => ({
  ...IDLE_TIMER,
  endsAt,
  pausedRemainingMs,
});

test("whole minutes, rounded up; then time's up; paused keeps its minutes", () => {
  expect(timeBox(IDLE_TIMER, 0)).toEqual({ kind: "idle" });
  expect(timeBox(at(180_000), 0)).toEqual({ kind: "running", minutes: 3 });
  expect(timeBox(at(180_000), 1)).toEqual({ kind: "running", minutes: 3 });
  expect(timeBox(at(180_000), 120_001)).toEqual({
    kind: "running",
    minutes: 1,
  });
  expect(timeBox(at(180_000), 179_999)).toEqual({
    kind: "running",
    minutes: 1,
  });
  expect(timeBox(at(180_000), 180_000)).toEqual({ kind: "up" });
  expect(timeBox(at(null, 125_000), 0)).toEqual({ kind: "paused", minutes: 3 });
  expect(timeBox(at(null, 10), 0)).toEqual({ kind: "paused", minutes: 1 });
});
