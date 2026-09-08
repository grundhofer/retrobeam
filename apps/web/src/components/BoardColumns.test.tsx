// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import type {
  ClientCommand,
  Column,
  Participant,
  ServerEvent,
} from "@retropolis/shared";
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

function view() {
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
      {/* 576px is the board width in the discussion phase at 1280: the page
          padding, the flex gap and the 320px action list are what is left. */}
      <div style={{ width: 576 }}>
        <BoardColumns
          columns={columns}
          notes={[]}
          columnCounts={{}}
          roster={[you]}
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
            focusId: null,
          }}
          gifsEnabled={false}
        />
      </div>
    </ConnectionProvider>
  );
}

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
