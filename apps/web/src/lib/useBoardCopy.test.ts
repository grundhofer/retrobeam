// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { fitName } from "./useBoardCopy.js";

// A localized "Follow-up: " prefix can push a board name past the server's
// 60-unit limit; the cut must never leave half a character behind.
test("fits a name within the limit without splitting an emoji", () => {
  const name = "Follow-up: " + "a".repeat(48) + "🚀 launch";
  const fitted = fitName(name, 60);
  expect(fitted.length).toBeLessThanOrEqual(60);
  expect(fitted.endsWith("a")).toBe(true); // the rocket did not fit whole
  expect(/[\uD800-\uDBFF]$/.test(fitted)).toBe(false);
});

test("keeps a short name as it is, trimmed", () => {
  expect(fitName("Folge-Retro: Sprint 47 ", 60)).toBe("Folge-Retro: Sprint 47");
});
