// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Column, Note } from "../protocol.js";

// The order the facilitator walks a presenter's cards in — ONE implementation,
// used by the server to seed and step the stage and by the client to render it.
// Two copies would be two chances to disagree, and "next" has to mean the same
// card on the shared screen and on every remote participant's.
//
// It is an ORDER OF IDS, never an index into anything: a member's board is not
// the facilitator's (a staged column is missing from theirs), so the same
// ordinal would land on different cards on different screens. The wire carries
// the id.
//
// Hidden (staged) columns are skipped on BOTH ends, for different reasons that
// happen to agree: a member was never sent those notes, and the facilitator —
// who holds them — must not put one on a stage the room is watching. A note id
// is a secret in this codebase; the same rule already refuses a hidden target
// in the discussion focus.
export function presenterCardOrder(
  notes: readonly Pick<Note, "id" | "columnId" | "authorId" | "order">[],
  columns: readonly Pick<Column, "id" | "order" | "hidden">[],
  presenterId: string,
): string[] {
  // Sorted here rather than trusted from the caller: the server passes rows in
  // query order and the client passes reducer-sorted state, and neither should
  // have to know what the other guarantees.
  const ordered = [...columns]
    .filter((column) => !column.hidden)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const ids: string[] = [];
  for (const column of ordered) {
    const cards = notes
      .filter(
        (note) => note.authorId === presenterId && note.columnId === column.id,
      )
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    for (const card of cards) ids.push(card.id);
  }
  return ids;
}
