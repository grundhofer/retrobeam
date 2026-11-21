// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { heldDuringDraw } from "./useDrawInFlight.js";

// While the wheel turns, the winner's cards stay off the screens that could
// not read them before the draw (owner, 2026-11-20).
test("a member does not get the winner's cards before the wheel lands", () => {
  expect(heldDuringDraw("ben", { id: "cara", isAdmin: false }, false)).toBe(
    "ben",
  );
  // Landed, or no draw: nothing held.
  expect(heldDuringDraw(null, { id: "cara", isAdmin: false }, false)).toBe(
    null,
  );
});

test("nothing is held from those who could read the cards already", () => {
  // The winner's own cards are theirs.
  expect(heldDuringDraw("ben", { id: "ben", isAdmin: false }, false)).toBe(
    null,
  );
  // The facilitator holds the whole board during the round.
  expect(heldDuringDraw("ben", { id: "anna", isAdmin: true }, false)).toBe(
    null,
  );
  // A board handed over is everyone's.
  expect(heldDuringDraw("ben", { id: "cara", isAdmin: false }, true)).toBe(
    null,
  );
});
