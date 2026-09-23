// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, expect, test } from "vitest";
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
        gifsEnabled={false}
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

// Editing a card is where a GIF gets added, swapped or dropped after the fact.
// The note.update contract: gifUrl omitted keeps the stored one, null clears
// it, a URL replaces it.
const GIF_A = "https://static.klipy.com/a.gif";
const GIF_B = "https://static.klipy.com/b.gif";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function editView(gifUrl: string | null, sent: ClientCommand[]) {
  const connection = {
    boardId: "a".repeat(32),
    send: () => {},
    mutate: (command: ClientCommand) => {
      sent.push(command);
    },
  };
  return (
    <ConnectionProvider value={connection}>
      <NoteCard
        note={{ ...note(ben.id), gifUrl }}
        roster={[anna, ben]}
        you={ben}
        phase="write"
        isAdmin={false}
        revealIndex={0}
        presenterId={null}
        gifsEnabled
        onDropNote={() => {}}
        onUngroup={() => {}}
      />
    </ConnectionProvider>
  );
}

test("editing a card can add a GIF it was written without", async () => {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).includes("/gifs/search"))
      return realFetch(input as RequestInfo, init);
    return Promise.resolve(
      new Response(
        JSON.stringify({
          configured: true,
          gifs: [
            {
              id: "1",
              url: GIF_B,
              previewUrl: GIF_B,
              width: 200,
              height: 100,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  }) as typeof fetch;
  const sent: ClientCommand[] = [];
  const screen = await render(editView(null, sent));

  await screen.getByRole("button", { name: /edit note|bearbeiten/i }).click();
  await screen.getByTestId("note-edit-gif").click();
  await screen.getByTestId("gif-search").fill("ship it");
  await screen.getByTestId("gif-result").click();
  await screen.getByRole("button", { name: /^(save|speichern)$/i }).click();

  expect(sent).toEqual([
    expect.objectContaining({
      type: "note.update",
      text: "Deploys are slow",
      gifUrl: GIF_B,
    }),
  ]);
});

test("editing a card can drop its GIF, and never adds one to an emptied text", async () => {
  const sent: ClientCommand[] = [];
  const screen = await render(editView(GIF_A, sent));

  await screen.getByRole("button", { name: /edit note|bearbeiten/i }).click();
  // The existing GIF has to go before another can be picked.
  expect(screen.getByTestId("note-edit-gif").elements()).toHaveLength(0);
  await screen.getByTestId("note-edit-gif-remove").click();
  await expect.element(screen.getByTestId("note-edit-gif")).toBeInTheDocument();
  // No text, no GIF — the same rule as the composer.
  await screen.getByRole("textbox").fill("");
  await expect
    .element(screen.getByTestId("note-edit-gif"))
    .not.toBeInTheDocument();
  await screen.getByRole("textbox").fill("Deploys are slow");
  await screen.getByRole("button", { name: /^(save|speichern)$/i }).click();

  expect(sent).toEqual([
    expect.objectContaining({ type: "note.update", gifUrl: null }),
  ]);
});

test("a text-only edit leaves the stored GIF alone", async () => {
  const sent: ClientCommand[] = [];
  const screen = await render(editView(GIF_A, sent));

  await screen.getByRole("button", { name: /edit note|bearbeiten/i }).click();
  await screen.getByRole("textbox").fill("Deploys are painfully slow");
  await screen.getByRole("button", { name: /^(save|speichern)$/i }).click();

  expect(sent).toHaveLength(1);
  // Omitted, not re-sent: a board whose GIFs were switched off since would
  // otherwise have the server drop it.
  expect(sent[0]).not.toHaveProperty("gifUrl");
  expect(sent[0]).toMatchObject({ text: "Deploys are painfully slow" });
});
