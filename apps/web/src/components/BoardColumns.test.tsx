// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
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

function view(
  overrides: Partial<React.ComponentProps<typeof BoardColumns>> = {},
  sent: ClientCommand[] = [],
) {
  const connection = {
    boardId: "a".repeat(32),
    send: (command: ClientCommand) => sent.push(command),
    mutate: (
      _command: ClientCommand,
      _optimistic: ServerEvent | ServerEvent[],
    ) => {},
  };
  return (
    <ConnectionProvider value={connection}>
      {/* 576px is the board width in the discussion phase at 1280: the page
          padding, the flex gap and the 320px action list are what is left. */}
      <div style={{ width: 576 }}>
        <BoardColumns
          columns={columns}
          notes={[]}
          columnCounts={{}}
          roster={[you, ben]}
          you={you}
          phase="discuss"
          editing={{}}
          isAdmin
          presenterId={null}
          unpresentedAuthorIds={null}
          deciding={{
            voteActive: false,
            mine: {},
            remaining: 0,
            maxPerTarget: null,
            talliesShown: true,
            tallies: {},
            topTargetIds: [],
            voters: null,
            focusId: null,
          }}
          gifsEnabled={false}
          {...overrides}
        />
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
