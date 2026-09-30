// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import {
  DEFAULT_PHASE_PLAN,
  EMPTY_VOTES,
  type Action,
  type BoardConfig,
  type ClientCommand,
  type Column,
  type Note,
  type Participant,
  type ServerEvent,
  type VotesState,
} from "@retrobeam/shared";
import "../i18n.js";
import "../index.css";
import { ConnectionProvider } from "../lib/connection.js";
import { useBoardStore } from "../store/boardStore.js";
import { RetroResults, type RetroResultsProps } from "./RetroResults.js";

// The finished retro used to show kudos, ROTI and actions and nothing else —
// the cards and the vote result were gone the moment the board said
// "archived". These pin what the results page promises: the crowned topics in
// the order the room discussed them, names only where the board shows them,
// an honest retention line, the export right there, and the whole board one
// click away.
const BOARD = "a".repeat(32);
const COLUMN: Column = {
  id: "c".repeat(32),
  name: "To improve",
  order: 0,
  hidden: false,
  rect: null,
};

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

function note(
  digit: string,
  text: string,
  authorId: string | null,
  groupId: string | null = null,
): Note {
  return {
    id: digit.repeat(32),
    columnId: COLUMN.id,
    authorId,
    text,
    gifUrl: null,
    order: Number.parseInt(digit, 16),
    x: null,
    y: null,
    groupId,
    reactions: {},
  };
}

// A stack (1 + 2, anchored on 1), a loose card that won, one that got a vote
// but no crown, and one nobody voted for.
const STACK = "1".repeat(32);
const notes: Note[] = [
  note("1", "Flaky pipeline", anna.id, STACK),
  note("2", "CI is red again", ben.id, STACK),
  note("3", "Deploys on Fridays", ben.id),
  note("4", "Standup too long", anna.id),
  note("5", "Nobody voted for me", anna.id),
];

const votes: VotesState = {
  ...EMPTY_VOTES,
  mine: {},
  // The server's order: most votes first. The loose card outranks the stack.
  tallies: { [notes[2]!.id]: 5, [STACK]: 3, [notes[3]!.id]: 1 },
  topTargetIds: [notes[2]!.id, STACK],
  voters: {
    [notes[2]!.id]: { [anna.id]: 2, [ben.id]: 3 },
    [STACK]: { [ben.id]: 3 },
  },
};

const action: Action = {
  id: "d".repeat(32),
  text: "Quarantine the flaky test",
  ownerId: ben.id,
  status: "open",
};

// Noon UTC, so the calendar day is the same in every runner's time zone.
const RETENTION = Date.UTC(2026, 11, 29, 12);

function config(overrides: Partial<BoardConfig> = {}): BoardConfig {
  return {
    anonymous: false,
    phasePlan: DEFAULT_PHASE_PLAN,
    votesPerPerson: 3,
    maxPerTarget: null,
    topN: 2,
    gifsEnabled: false,
    pickerStyle: "wheel",
    layout: "columns",
    cursorsEnabled: false,
    voterNamesEnabled: true,
    focusMode: false,
    ...overrides,
  };
}

function view(overrides: Partial<RetroResultsProps> = {}) {
  const connection = {
    boardId: BOARD,
    send: (_command: ClientCommand) => {},
    mutate: (
      _command: ClientCommand,
      _optimistic: ServerEvent | ServerEvent[],
    ) => {},
  };
  // NoteCard reads anonymity from the store, the same flag the page gets.
  useBoardStore.setState((store) => ({
    state: {
      ...store.state,
      phase: "done",
      config: config({
        anonymous: overrides.anonymous ?? false,
        voterNamesEnabled: overrides.voterNamesEnabled ?? true,
      }),
    },
  }));
  return (
    <ConnectionProvider value={connection}>
      <RetroResults
        boardId={BOARD}
        columns={[COLUMN]}
        notes={notes}
        roster={[anna, ben]}
        you={anna}
        isAdmin
        votes={votes}
        actions={[action]}
        kudos={[]}
        rotiReleased={false}
        retentionAt={RETENTION}
        headcount={3}
        anonymous={false}
        voterNamesEnabled
        gifsEnabled={false}
        {...overrides}
      />
    </ConnectionProvider>
  );
}

afterEach(() => {
  useBoardStore.getState().reset();
});

test("leads with the crowned topics in rank order, each with its vote count", async () => {
  const screen = await render(view());

  const topics = screen.getByTestId("top-topic");
  await expect.element(topics.first()).toBeVisible();
  expect(topics.elements()).toHaveLength(2);

  const [first, second] = topics.elements();
  // Rank 1 is the loose card with 5 votes, not the stack that sits first in
  // the column — the ranking is the vote's, not the board's layout.
  expect(first?.textContent).toContain("👑 1");
  expect(first?.textContent).toContain("Deploys on Fridays");
  expect(first?.querySelector('[data-testid="tally"]')?.textContent).toMatch(
    /^5/,
  );
  // The crowned stack brings both of its cards, anchor first.
  expect(second?.textContent).toContain("👑 2");
  expect(second?.querySelector('[data-testid="tally"]')?.textContent).toMatch(
    /^3/,
  );
  const stacked = [
    ...(second?.querySelectorAll('[data-testid="note-card"]') ?? []),
  ].map((card) => card.textContent ?? "");
  expect(stacked).toHaveLength(2);
  expect(stacked[0]).toContain("Flaky pipeline");
  expect(stacked[1]).toContain("CI is red again");

  // Crowned only: a card with a vote but no crown is not a top topic.
  const section = screen.getByTestId("top-topics").element().textContent;
  expect(section).not.toContain("Standup too long");

  // The action items follow, read-only.
  await expect
    .element(screen.getByTestId("action-item"))
    .toHaveTextContent("Quarantine the flaky test");
  expect(
    screen.getByTestId("actions-panel").element().querySelector("form"),
  ).toBeNull();
});

test("names the voters only where the board shows them", async () => {
  const named = await render(view());
  await expect.element(named.getByTestId("top-topic").first()).toBeVisible();
  expect(named.getByTestId("voter-Ben").elements().length).toBeGreaterThan(0);
  await named.unmount();

  // Names switched off: a stale voter map in the store must not bring them back.
  const namesOff = await render(view({ voterNamesEnabled: false }));
  await expect.element(namesOff.getByTestId("top-topic").first()).toBeVisible();
  expect(namesOff.getByTestId("voter-Ben").elements()).toHaveLength(0);
  expect(namesOff.getByTestId("voter-Anna").elements()).toHaveLength(0);
  await namesOff.unmount();

  // Anonymous: no voters, and no author on any card either.
  const anonymous = await render(
    view({ anonymous: true, voterNamesEnabled: true }),
  );
  const top = anonymous.getByTestId("top-topics");
  await expect.element(top).toBeVisible();
  expect(anonymous.getByTestId("voter-Ben").elements()).toHaveLength(0);
  expect(top.element().textContent).not.toContain("Ben");
  expect(top.element().textContent).not.toContain("Anna");
  expect(
    anonymous.getByTestId("results-recap").element().textContent,
  ).not.toMatch(/Anna|Ben/);
});

test("says what it holds and when it goes away", async () => {
  // Three people finished it; the roster holds two here. The count is the
  // server's at "done" — a roster also grows with everyone who opens the
  // finished board just to read it.
  const screen = await render(view());
  await expect
    .element(screen.getByTestId("results-recap"))
    .toHaveTextContent(
      /5 (cards|Karten) · 3 (people|Personen) · 1 (action item|Action Item)$/,
    );
  // The real date, in the UI language — not an ISO stamp.
  await expect
    .element(screen.getByTestId("results-retention"))
    .toHaveTextContent(/29\.? (December|Dezember) 2026/);
  await screen.unmount();

  // A kept board has no date, and must not pretend to.
  const kept = await render(view({ retentionAt: null }));
  const line = kept.getByTestId("results-retention");
  await expect.element(line).toHaveTextContent(/kept|behalten/);
  expect(line.element().textContent).not.toMatch(/2026/);
  await kept.unmount();

  // A board finished before the count was recorded: no number rather than
  // the roster's, which would count its readers.
  const unrecorded = await render(view({ headcount: null }));
  await expect
    .element(unrecorded.getByTestId("results-recap"))
    .toHaveTextContent(/5 (cards|Karten) · 1 (action item|Action Item)$/);
  expect(
    unrecorded.getByTestId("results-recap").element().textContent,
  ).not.toMatch(/people|Personen/);
});

test("offers the export right there, summary first", async () => {
  const screen = await render(view());
  const md = screen.getByTestId("results-export-md");
  await expect.element(md).toBeVisible();
  await expect.element(screen.getByTestId("results-export-pdf")).toBeVisible();
  await expect.element(screen.getByTestId("results-export-jpeg")).toBeVisible();
  await expect
    .element(screen.getByTestId("results-scope-summary"))
    .toHaveAttribute("aria-pressed", "true");

  const href = () => md.element().getAttribute("href") ?? "";
  // The same URL the board menu builds for the summary.
  expect(href()).toBe(`/api/boards/${BOARD}/export?format=md&scope=summary`);

  await screen.getByTestId("results-include-authors").click();
  await expect
    .element(md)
    .toHaveAttribute("href", expect.stringContaining("authors=true"));

  await screen.getByTestId("results-scope-all").click();
  await expect
    .element(md)
    .not.toHaveAttribute("href", expect.stringContaining("scope="));
  expect(href()).toContain("authors=true");
});

test("keeps the whole board one click away, read-only", async () => {
  const screen = await render(view());
  const toggle = screen.getByTestId("all-cards-toggle");
  await expect.element(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByTestId("board-column").elements()).toHaveLength(0);

  await toggle.click();
  await expect.element(toggle).toHaveAttribute("aria-expanded", "true");
  const column = screen.getByTestId("board-column");
  await expect.element(column).toBeVisible();
  // Every card, including the ones without a crown.
  await expect.element(column).toHaveTextContent("Nobody voted for me");
  // Nothing to write with, and no column controls — not even for the
  // facilitator, whom the server refuses on a finished board as well.
  expect(
    column.element().querySelectorAll("textarea, [aria-pressed]"),
  ).toHaveLength(0);
  expect(
    screen.getByRole("button", { name: /rename|umbenennen/i }).elements(),
  ).toHaveLength(0);
  expect(column.element().querySelectorAll('[draggable="true"]')).toHaveLength(
    0,
  );
});

test("a board that never voted leads with its cards instead", async () => {
  const screen = await render(
    view({ votes: { ...EMPTY_VOTES, tallies: {}, topTargetIds: [] } }),
  );
  await expect
    .element(screen.getByTestId("board-column"))
    .toHaveTextContent("Deploys on Fridays");
  await expect
    .element(screen.getByTestId("all-cards-toggle"))
    .toHaveAttribute("aria-expanded", "true");
  expect(screen.getByTestId("top-topics").elements()).toHaveLength(0);
});

// A plan that goes straight from vote to done: the server sends phase.changed
// before votes.revealed, so the page mounts for a moment with no crowns. It
// used to fix "no crowns, so open the whole board" at that moment and keep it,
// so everyone in the room got the full board where a reload got the topics.
test("crowns that land after the page opened fold the board away again", async () => {
  const crownless = { ...EMPTY_VOTES, tallies: null, topTargetIds: [] };
  const screen = await render(view({ votes: crownless }));
  const toggle = screen.getByTestId("all-cards-toggle");
  await expect.element(toggle).toHaveAttribute("aria-expanded", "true");

  await screen.rerender(view());
  await expect.element(screen.getByTestId("top-topic").first()).toBeVisible();
  await expect.element(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByTestId("board-column").elements()).toHaveLength(0);
});

test("a board opened by hand stays open when the crowns land", async () => {
  const crownless = { ...EMPTY_VOTES, tallies: null, topTargetIds: [] };
  const screen = await render(view({ votes: crownless }));
  const toggle = screen.getByTestId("all-cards-toggle");
  await toggle.click(); // closed by hand…
  await toggle.click(); // …and opened again
  await expect.element(toggle).toHaveAttribute("aria-expanded", "true");

  await screen.rerender(view());
  await expect.element(screen.getByTestId("top-topic").first()).toBeVisible();
  await expect.element(toggle).toHaveAttribute("aria-expanded", "true");
});

// Finishing unmounts the button that did it, and focus fell to <body>: the
// next Tab started from the top and nothing said the retro was over.
test("picks up dropped focus on its heading, and takes it from nobody", async () => {
  (document.activeElement as HTMLElement | null)?.blur();
  const screen = await render(view());
  const title = screen.getByTestId("results-title");
  await expect.element(title).toHaveFocus();
  await expect.element(title).toHaveRole("heading");
  await screen.unmount();

  // Someone still in a control keeps it.
  const input = document.createElement("input");
  document.body.append(input);
  input.focus();
  try {
    const again = await render(view());
    await expect.element(again.getByTestId("results-title")).toBeVisible();
    expect(document.activeElement).toBe(input);
  } finally {
    input.remove();
  }
});

// The outcome first, then the export: on a phone the export card alone used to
// fill the first screen. And one heading level for every section, including
// the ones it borrows (ActionsPanel, KudosWall), with the board's columns
// under "All cards".
test("reads outcome first, with one level of section headings", async () => {
  const screen = await render(view());
  await screen.getByTestId("all-cards-toggle").click();
  await expect.element(screen.getByTestId("board-column")).toBeVisible();

  const follows = (a: string, b: string) =>
    Boolean(
      screen
        .getByTestId(a)
        .element()
        .compareDocumentPosition(screen.getByTestId(b).element()) &
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  expect(follows("top-topics", "results-export")).toBe(true);
  expect(follows("actions-panel", "results-export")).toBe(true);
  expect(follows("results-retention", "results-export")).toBe(true);

  const headings = [...screen.container.querySelectorAll("h1,h2,h3,h4")].map(
    (h) =>
      `${h.tagName} ${(h.textContent ?? "").replace(/[^\p{L} -]/gu, "").trim()}`,
  );
  expect(headings).toEqual([
    expect.stringMatching(/^H2 (Retro finished|Retro abgeschlossen)$/),
    expect.stringMatching(/^H2 (Top topics|Top-Themen)$/),
    expect.stringMatching(/^H2 Action Items$/i),
    expect.stringMatching(/^H2 (Save the results|Ergebnis sichern)$/),
    expect.stringMatching(/^H2 (All cards|Alle Karten)$/),
    expect.stringMatching(/^H3 (To improve)$/),
  ]);
});
