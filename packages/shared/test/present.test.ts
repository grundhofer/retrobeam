// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { presenterCardOrder } from "../src/domain/present.js";

const anna = "a".repeat(32);
const ben = "b".repeat(32);

function column(id: string, order: number, hidden = false) {
  return { id: id.repeat(32), order, hidden };
}

function note(id: string, columnId: string, authorId: string, order: number) {
  return { id: id.repeat(32), columnId: columnId.repeat(32), authorId, order };
}

describe("presenterCardOrder", () => {
  const columns = [column("2", 1), column("1", 0)];
  const notes = [
    note("d", "2", anna, 1),
    note("b", "1", anna, 2),
    note("a", "1", anna, 1),
    note("c", "1", ben, 1),
  ];

  it("walks columns in board order, then cards in note order", () => {
    // The columns arrive out of order on purpose: the helper sorts them itself,
    // so the server (query order) and the client (reducer order) cannot drift.
    expect(presenterCardOrder(notes, columns, anna)).toEqual([
      "a".repeat(32),
      "b".repeat(32),
      "d".repeat(32),
    ]);
  });

  it("carries only the presenter's own cards", () => {
    expect(presenterCardOrder(notes, columns, ben)).toEqual(["c".repeat(32)]);
    expect(presenterCardOrder(notes, columns, "z".repeat(32))).toEqual([]);
  });

  it("skips staged columns, so a hidden card can never take the stage", () => {
    // A note id is a secret here: the facilitator holds the staged column, the
    // room does not, and a stage everyone is watching must not name one.
    const staged = [column("2", 1), column("1", 0, true)];
    expect(presenterCardOrder(notes, staged, anna)).toEqual(["d".repeat(32)]);
  });

  it("breaks ties by id so every screen agrees", () => {
    const tied = [note("b", "1", anna, 1), note("a", "1", anna, 1)];
    expect(presenterCardOrder(tied, columns, anna)).toEqual([
      "a".repeat(32),
      "b".repeat(32),
    ]);
  });
});
