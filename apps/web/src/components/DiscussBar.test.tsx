// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import type { ClientCommand, Note, ServerEvent } from "@retrobeam/shared";
import "../i18n.js";
import { ConnectionProvider } from "../lib/connection.js";
import { DiscussBar } from "./DiscussBar.js";

// The chip names a crowned stack by one of its cards. Which one must be the
// same on every screen: the store's note order is not (on an anonymous board a
// client holds its own cards first — they arrived while writing, the reveal
// appends the rest), so a chip that took "the first member" showed each
// viewer their own card, and a shared screen showed the room whose it was.
const COLUMN = "c".repeat(32);
const A = "1".repeat(32);
const B = "2".repeat(32);
const F = "f".repeat(32);

function note(id: string, text: string, groupId: string | null): Note {
  return {
    id,
    columnId: COLUMN,
    authorId: null,
    text,
    gifUrl: null,
    order: 0,
    x: null,
    y: null,
    groupId,
    reactions: {},
  };
}

function view(topTargetIds: string[], notes: Note[]) {
  const connection = {
    boardId: "a".repeat(32),
    send: (_command: ClientCommand) => {},
    mutate: (
      _command: ClientCommand,
      _optimistic: ServerEvent | ServerEvent[],
    ) => {},
  };
  return (
    <ConnectionProvider value={connection}>
      <DiscussBar
        topTargetIds={topTargetIds}
        tallies={null}
        focusId={null}
        notes={notes}
        isAdmin={false}
      />
    </ConnectionProvider>
  );
}

test("a stack chip shows its anchor whatever order the store holds", async () => {
  // Stacked onto B. The viewer wrote F, so F sits first in their store.
  const ownFirst = [
    note(F, "mine", B),
    note(A, "alpha", B),
    note(B, "beta", B),
  ];
  const idOrder = [note(A, "alpha", B), note(B, "beta", B), note(F, "mine", B)];

  const mine = await render(view([B], ownFirst));
  await expect
    .element(mine.getByTestId("discuss-chip-1"))
    .toHaveTextContent("beta ×3");
  await mine.rerender(view([B], idOrder));
  await expect
    .element(mine.getByTestId("discuss-chip-1"))
    .toHaveTextContent("beta ×3");
});

test("a stack whose anchor was deleted falls back to the lowest id", async () => {
  // The stack id B names a note that is gone.
  const ownFirst = [note(F, "mine", B), note(A, "alpha", B)];
  const screen = await render(view([B], ownFirst));
  await expect
    .element(screen.getByTestId("discuss-chip-1"))
    .toHaveTextContent("alpha ×2");
});
