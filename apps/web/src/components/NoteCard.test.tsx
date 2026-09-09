// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import type {
  ClientCommand,
  Note,
  Participant,
  ServerEvent,
} from "@retrobeam/shared";
import "../i18n.js";
import { ConnectionProvider } from "../lib/connection.js";
import { NoteCard } from "./NoteCard.js";

// The presenting round no longer hides other people's cards — the server sends
// a member only what the round has reached, and the speaker's cards are lifted
// out of that. So the distinction has to be visible on the card itself, and the
// e2e specs assert it by semantics rather than by a Tailwind class.
const anna: Participant = {
  id: "a".repeat(32),
  name: "Anna",
  color: "#0e7c7b",
  role: "facilitator",
  online: true,
};
const ben: Participant = {
  id: "b".repeat(32),
  name: "Ben",
  color: "#1971C2",
  role: "member",
  online: true,
};

function note(authorId: string): Note {
  return {
    id: "c".repeat(32),
    columnId: "d".repeat(32),
    authorId,
    text: "Deploys are slow",
    order: 1,
    gifUrl: null,
    x: null,
    y: null,
    groupId: null,
    reactions: {},
  };
}

function view(props: {
  authorId: string;
  presenterId: string | null;
  unpresentedAuthorIds?: ReadonlySet<string> | null;
}) {
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
      <NoteCard
        note={note(props.authorId)}
        roster={[anna, ben]}
        you={ben}
        phase="present"
        isAdmin={false}
        revealIndex={0}
        presenterId={props.presenterId}
        unpresentedAuthorIds={props.unpresentedAuthorIds ?? null}
        onDropNote={() => {}}
        onUngroup={() => {}}
      />
    </ConnectionProvider>
  );
}

test("the speaker's card is marked, the rest of the board is not", async () => {
  const spotlit = await render(
    view({ authorId: anna.id, presenterId: anna.id }),
  );
  await expect
    .element(spotlit.getByTestId("note-card"))
    .toHaveAttribute("data-presenting", "true");

  const other = await render(view({ authorId: ben.id, presenterId: anna.id }));
  expect(
    other
      .getByTestId("note-card")
      .elements()
      .at(-1)
      ?.getAttribute("data-presenting"),
  ).toBe(null);
});

test("a card the room has not been shown is marked as pending", async () => {
  const pending = await render(
    view({
      authorId: anna.id,
      presenterId: null,
      unpresentedAuthorIds: new Set([anna.id]),
    }),
  );
  await expect
    .element(pending.getByTestId("note-card"))
    .toHaveAttribute("data-pending", "true");

  const shown = await render(
    view({
      authorId: anna.id,
      presenterId: null,
      unpresentedAuthorIds: new Set([ben.id]),
    }),
  );
  expect(
    shown
      .getByTestId("note-card")
      .elements()
      .at(-1)
      ?.getAttribute("data-pending"),
  ).toBe(null);
});
