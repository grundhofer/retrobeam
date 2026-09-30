// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { useState } from "react";
import { page, userEvent } from "vitest/browser";
import type {
  ClientCommand,
  Column,
  Note,
  Participant,
  ServerEvent,
} from "@retrobeam/shared";
import "../i18n.js";
import "../index.css";
import { ConnectionProvider } from "../lib/connection.js";
import { BoardColumns } from "./BoardColumns.js";

// Four fixed-width columns needed 1200px; the discussion phase left the board
// 576px on a 1280 laptop and clipped the rest inside an overflow-x-auto strip
// with no scrollbar, no fade and no arrows. The columns were not covered by
// anything — they were cut off flush against the participant card, which is
// what got reported as "the panel hides the columns". The assertion is
// therefore geometric: every column's right edge must sit inside the board.
const columns: Column[] = ["Went well", "To improve", "Ideas", "Kudos"].map(
  (name, index) => ({
    id: `${index}`.repeat(32),
    name,
    order: index,
    hidden: false,
    rect: null,
  }),
);

const you: Participant = {
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

function note(id: string, columnId: string, order: number): Note {
  return {
    id: id.repeat(32),
    columnId,
    authorId: you.id,
    text: `note ${id}`,
    gifUrl: null,
    order,
    x: null,
    y: null,
    groupId: null,
    reactions: {},
  };
}

const baseProps: React.ComponentProps<typeof BoardColumns> = {
  columns,
  notes: [],
  columnCounts: {},
  roster: [you, ben],
  you,
  phase: "discuss",
  editing: {},
  isAdmin: true,
  presenterId: null,
  unpresentedAuthorIds: null,
  deciding: {
    voteActive: false,
    mine: {},
    remaining: 0,
    maxPerTarget: null,
    talliesShown: true,
    tallies: {},
    topTargetIds: [],
    voters: null,
    focusId: null,
  },
  gifsEnabled: false,
};

function view(
  overrides: Partial<React.ComponentProps<typeof BoardColumns>> = {},
  sent: ClientCommand[] = [],
  mutated: [ClientCommand, ServerEvent | ServerEvent[]][] = [],
) {
  const connection = {
    boardId: "a".repeat(32),
    send: (command: ClientCommand) => sent.push(command),
    mutate: (
      command: ClientCommand,
      optimistic: ServerEvent | ServerEvent[],
    ) => {
      mutated.push([command, optimistic]);
    },
  };
  return (
    <ConnectionProvider value={connection}>
      {/* 576px is the board width in the discussion phase at 1280: the page
          padding, the flex gap and the 320px action list are what is left. */}
      <div style={{ width: 576 }}>
        <BoardColumns {...baseProps} {...overrides} />
      </div>
    </ConnectionProvider>
  );
}

test("discussion without a voting result lets the facilitator focus a card", async () => {
  const sent: ClientCommand[] = [];
  const target = note("1", columns[0]!.id, 1);
  const screen = await render(view({ notes: [target] }, sent));

  await screen.getByTestId("discuss-focus-card").click();
  expect(sent).toEqual([{ type: "admin.discuss.focus", targetId: target.id }]);
});

test("every column stays inside the board at a starved width", async () => {
  await page.viewport(1280, 720);
  const screen = await render(view());

  const strip = screen.getByTestId("column-strip").element();
  const board = strip.getBoundingClientRect();
  const cards = screen.getByTestId("board-column").elements();
  expect(cards).toHaveLength(4);

  for (const card of cards) {
    const box = card.getBoundingClientRect();
    // Sub-pixel tolerance: fractional track widths round the last edge.
    expect(box.right).toBeLessThanOrEqual(board.right + 1);
    expect(box.width).toBeGreaterThan(0);
  }
  // Nothing is parked in horizontal overflow any more — the columns wrap.
  expect(strip.scrollWidth).toBeLessThanOrEqual(strip.clientWidth + 1);
});

// The reported annoyance: every card that landed in a column — your own, and a
// colleague's ghost — was inserted ABOVE the composer and pushed the textarea
// (and the caret in it) one card height further down. The fix is a DOM-order
// one, so the assertion has to be on DOM order.
test("the composer and the in-progress ghosts stay above the finished cards", async () => {
  const columnId = columns[0]!.id;
  const screen = await render(
    view({
      phase: "write",
      notes: [note("1", columnId, 1), note("2", columnId, 2)],
      editing: { [ben.id]: columnId },
      columnCounts: { [columnId]: 5 },
    }),
  );

  const column = screen.getByTestId("board-column").first().element();
  const rows = [...column.querySelectorAll("[data-testid]")].filter((el) => {
    const id = el.getAttribute("data-testid") ?? "";
    return (
      id.startsWith("composer-") || id === "ghost-card" || id === "note-card"
    );
  });
  const kinds = rows.map((el) => {
    const id = el.getAttribute("data-testid") ?? "";
    return id.startsWith("composer-") ? "composer" : id;
  });
  expect(kinds[0]).toBe("composer");
  expect(kinds[1]).toBe("ghost-card");
  expect(kinds.slice(2).every((kind) => kind === "note-card")).toBe(true);

  // Newest-first while writing: your last card sits directly under the box you
  // are typing in, rather than drifting to the bottom of a growing column.
  const cards = screen.getByTestId("note-card").elements();
  expect(cards[0]?.textContent).toContain("note 2");
});

// The write-phase flip must not leak into a phase the room READS: presenting,
// stacking and the export all follow the ascending order.
test("a revealed phase keeps the ascending reading order", async () => {
  const columnId = columns[0]!.id;
  const screen = await render(
    view({
      phase: "present",
      notes: [note("1", columnId, 1), note("2", columnId, 2)],
    }),
  );
  const cards = screen.getByTestId("note-card").elements();
  expect(cards[0]?.textContent).toContain("note 1");
});

// "It should be visible what you voted for and who voted for what." Two halves:
// your own dots need no server work at all, the voter chips ride the gated
// reveal — so the null case (a blind board) is asserted alongside.
test("the reveal shows your own dots, and the voters when the board names them", async () => {
  const columnId = columns[0]!.id;
  const target = note("1", columnId, 1);
  const blind = await render(
    view({
      phase: "discuss",
      notes: [target],
      deciding: {
        voteActive: false,
        mine: { [target.id]: 2 },
        remaining: 0,
        maxPerTarget: null,
        talliesShown: true,
        tallies: { [target.id]: 3 },
        topTargetIds: [target.id],
        voters: null,
        focusId: null,
      },
    }),
  );
  await expect.element(blind.getByTestId("your-vote")).toBeVisible();
  expect(blind.getByTestId("voter-Ben").elements()).toHaveLength(0);
  await blind.unmount();

  const named = await render(
    view({
      phase: "discuss",
      notes: [target],
      deciding: {
        voteActive: false,
        mine: { [target.id]: 2 },
        remaining: 0,
        maxPerTarget: null,
        talliesShown: true,
        tallies: { [target.id]: 3 },
        topTargetIds: [target.id],
        voters: { [target.id]: { [you.id]: 2, [ben.id]: 1 } },
        focusId: null,
      },
    }),
  );
  await expect.element(named.getByTestId("voter-Anna")).toBeVisible();
  await expect.element(named.getByTestId("voter-Ben")).toBeVisible();
  // A voter id with no roster row is skipped, never rendered as raw hex.
  expect(
    named.getByTestId("board-column").first().element().textContent,
  ).not.toContain(you.id);
});

test("the composer offers a GIF only once the note has text", async () => {
  const screen = await render(view({ phase: "write", gifsEnabled: true }));
  const columnId = columns[0]!.id;

  // A GIF illustrates a note; on an empty composer there is nothing to
  // illustrate, so the button waits — like the submit button next to it.
  expect(
    screen.getByTestId(`composer-gif-${columnId}`).elements(),
  ).toHaveLength(0);
  await screen.getByTestId(`composer-${columnId}`).fill("Deploys are slow");
  await expect
    .element(screen.getByTestId(`composer-gif-${columnId}`))
    .toBeInTheDocument();
  // Whitespace is not text.
  await screen.getByTestId(`composer-${columnId}`).fill("   ");
  await expect
    .element(screen.getByTestId(`composer-gif-${columnId}`))
    .not.toBeInTheDocument();
});

// WCAG 2.1.1: moving and stacking were drag-only. The card's ⋯ is their
// keyboard and touch twin, and it must be a twin — the very command and
// optimistic echo a drop produces, opId aside — not a second code path.
test("the card's move and stack options send exactly what a drop sends", async () => {
  const columnId = columns[0]!.id;
  const a = note("1", columnId, 1);
  const b = note("2", columnId, 2);
  const mutated: [ClientCommand, ServerEvent | ServerEvent[]][] = [];
  const screen = await render(
    view({ phase: "present", notes: [a, b] }, [], mutated),
  );
  const withoutOpId = ([command, echo]: (typeof mutated)[number]) => [
    { ...command, opId: "" },
    echo,
  ];

  function drop(target: Element) {
    const data = new DataTransfer();
    data.setData("application/x-retrobeam-note", a.id);
    target.dispatchEvent(
      new DragEvent("drop", {
        dataTransfer: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }
  const cardA = screen.getByTestId("note-card").nth(0);
  const cardB = screen.getByTestId("note-card").nth(1);

  // Drag: card A onto the second column, then onto card B.
  drop(screen.getByTestId("board-column").nth(1).element());
  drop(cardB.element());
  expect(mutated.map(([command]) => command.type)).toEqual([
    "note.move",
    "note.group",
  ]);
  const dragged = mutated.splice(0).map(withoutOpId);

  // The same two through the ⋯ of card A.
  await cardA.getByTestId("note-arrange-toggle").click();
  await cardA
    .getByTestId("note-move-option")
    .filter({ hasText: columns[1]!.name })
    .click();
  await cardA.getByTestId("note-arrange-toggle").click();
  const stackOptions = cardA.getByTestId("note-stack-option");
  expect(stackOptions.elements().map((el) => el.textContent)).toEqual([b.text]);
  await stackOptions.click();
  expect(mutated.map(withoutOpId)).toEqual(dragged);
});

test("voting freezes the board: no move or stack options", async () => {
  const columnId = columns[0]!.id;
  const screen = await render(
    view({
      phase: "vote",
      notes: [note("1", columnId, 1), note("2", columnId, 2)],
    }),
  );
  expect(screen.getByTestId("note-card").elements()).toHaveLength(2);
  expect(screen.getByTestId("note-arrange-toggle").elements()).toHaveLength(0);
});

test("while writing, your own card moves but does not stack", async () => {
  const columnId = columns[0]!.id;
  const screen = await render(
    view({
      phase: "write",
      notes: [note("1", columnId, 1), note("2", columnId, 2)],
    }),
  );
  await screen.getByTestId("note-arrange-toggle").first().click();
  await expect
    .element(screen.getByTestId("note-move-option").first())
    .toBeVisible();
  expect(screen.getByTestId("note-move-option").elements()).toHaveLength(3);
  expect(screen.getByTestId("note-stack-option").elements()).toHaveLength(0);
});

// The ⋯ panel sits inside the card, so a card stepped back behind the
// presenter (opacity-70) faded the panel's labels to 2.8:1. Opening it
// lifts the dim; closing it puts the dim back.
test("an open move/stack panel is not faded with its dimmed card", async () => {
  const columnId = columns[0]!.id;
  const screen = await render(
    view({
      phase: "present",
      presenterId: ben.id,
      notes: [note("1", columnId, 1), note("2", columnId, 2)],
    }),
  );
  const card = screen.getByTestId("note-card").first();
  const opacity = () => getComputedStyle(card.element()).opacity;
  await expect.poll(opacity).toBe("0.7");
  await card.getByTestId("note-arrange-toggle").click();
  await expect.element(card.getByTestId("note-arrange")).toBeVisible();
  await expect.poll(opacity).toBe("1");
  await card.getByTestId("note-arrange-toggle").click();
  await expect.poll(opacity).toBe("0.7");
});

// A move or a stack remounts the card (another column, or inside a
// NoteStack), and the focused option button goes with the old mount. The
// keyboard user must land back on the card's ⋯, not on <body>. The echo
// is applied here the way the store applies it, so the remount is real.
test("focus follows the card after a keyboard move or stack", async () => {
  const columnId = columns[0]!.id;
  const initial = [note("1", columnId, 1), note("2", columnId, 2)];
  function Live() {
    const [notes, setNotes] = useState(initial);
    const connection = {
      boardId: "a".repeat(32),
      send: () => {},
      mutate: (_: ClientCommand, echo: ServerEvent | ServerEvent[]) => {
        const events = Array.isArray(echo) ? echo : [echo];
        setNotes((current) =>
          events.reduce(
            (acc, event) =>
              event.type === "note.updated"
                ? acc.map((n) => (n.id === event.note.id ? event.note : n))
                : acc,
            current,
          ),
        );
      },
    };
    return (
      <ConnectionProvider value={connection}>
        <BoardColumns {...baseProps} phase="present" notes={notes} />
      </ConnectionProvider>
    );
  }
  const screen = await render(<Live />);
  const toggleOf = (id: string) =>
    document.querySelector(
      `[data-note-id="${id.repeat(32)}"] [data-testid="note-arrange-toggle"]`,
    );

  // Stack card 1 onto card 2 — it re-renders inside a NoteStack.
  await screen.getByTestId("note-arrange-toggle").first().click();
  await screen.getByTestId("note-stack-option").first().click();
  await expect.element(screen.getByTestId("note-stack")).toBeVisible();
  await expect.poll(() => document.activeElement).toBe(toggleOf("1"));

  // Move it on to the second column — out of the stack, into another list.
  await userEvent.keyboard("{Enter}");
  await screen
    .getByTestId("note-move-option")
    .filter({ hasText: columns[1]!.name })
    .click();
  await expect
    .element(screen.getByTestId("board-column").nth(1).getByTestId("note-card"))
    .toBeVisible();
  await expect.poll(() => document.activeElement).toBe(toggleOf("1"));
});
