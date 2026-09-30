// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { MemoryRouter } from "react-router";
import type { ClientCommand, ServerEvent } from "@retrobeam/shared";
import "../i18n.js";
import "../index.css";
import { ConnectionProvider } from "../lib/connection.js";
import { saveAdminToken } from "../lib/session.js";
import { AdminLink } from "./AdminLink.js";
import { BoardMenu } from "./BoardMenu.js";

// The facilitator link hands over the whole capability, so WHO is offered it
// matters more than how it looks. Each test uses its own board id: session.ts
// keeps an in-memory copy of every token it saved, which outlives a
// localStorage cleanup within the page.
const TOKEN = "fedcba9876543210fedcba9876543210";

function view(boardId: string, isAdmin: boolean) {
  const connection = {
    boardId,
    send: (_command: ClientCommand) => {},
    mutate: (
      _command: ClientCommand,
      _optimistic: ServerEvent | ServerEvent[],
    ) => {},
  };
  return (
    <MemoryRouter>
      <ConnectionProvider value={connection}>
        <BoardMenu
          boardId={boardId}
          boardName="Sprint 42"
          isAdmin={isAdmin}
          gifsEnabled
          cursorsEnabled={false}
          voterNamesEnabled={false}
          anonymous={false}
          phase="discuss"
          layout="columns"
          retentionAt={null}
        />
      </ConnectionProvider>
    </MemoryRouter>
  );
}

async function openMenu(boardId: string, isAdmin: boolean) {
  const screen = await render(view(boardId, isAdmin));
  const trigger = screen.getByTestId("board-menu");
  await expect.element(trigger).toBeVisible();
  await trigger.click();
  await expect.element(screen.getByTestId("export-md")).toBeVisible();
  return screen;
}

test("the token holder gets the link mid-retro, masked until asked", async () => {
  const boardId = "1".repeat(32);
  saveAdminToken(boardId, TOKEN);
  const screen = await openMenu(boardId, true);

  const input = screen.getByTestId("admin-link-input");
  await expect.element(screen.getByTestId("admin-link")).toBeVisible();
  // Masked: the screen may be on a projector.
  await expect
    .element(input)
    .toHaveValue(`${location.origin}/board/${boardId}#admin=••••••••`);

  await screen.getByTestId("admin-link-reveal").click();
  await expect
    .element(input)
    .toHaveValue(`${location.origin}/board/${boardId}#admin=${TOKEN}`);
});

test("a co-facilitator promoted by role holds no token and is offered none", async () => {
  const screen = await openMenu("2".repeat(32), true);
  // The settings section renders, so the menu really is the facilitator's.
  await expect.element(screen.getByTestId("gifs-toggle")).toBeVisible();
  expect(screen.getByTestId("admin-link").elements()).toHaveLength(0);
  // Duplicate and follow-up need the token too; the server would refuse a
  // co-facilitator, so the buttons are not offered (they used to do nothing).
  expect(screen.getByTestId("duplicate-board").elements()).toHaveLength(0);
  expect(screen.getByTestId("follow-up-board").elements()).toHaveLength(0);
});

test("a demoted token holder is not offered it either", async () => {
  const boardId = "3".repeat(32);
  saveAdminToken(boardId, TOKEN);
  const screen = await openMenu(boardId, false);
  expect(screen.getByTestId("admin-link").elements()).toHaveLength(0);
});

test("the reveal toggle keeps its label; the state is in aria-pressed", async () => {
  const boardId = "4".repeat(32);
  const screen = await render(
    <AdminLink boardId={boardId} adminToken={TOKEN} />,
  );
  const reveal = screen.getByTestId("admin-link-reveal");
  const label = reveal.element().textContent;

  await expect.element(reveal).toHaveAttribute("aria-pressed", "false");
  await reveal.click();
  // Announced as "<label>, pressed": a label that swapped to "Hide" here would
  // read as hiding switched on while the link is on screen.
  await expect.element(reveal).toHaveAttribute("aria-pressed", "true");
  await expect.element(reveal).toHaveTextContent(label ?? "");
  await expect
    .element(screen.getByTestId("admin-link-input"))
    .toHaveValue(`${location.origin}/board/${boardId}#admin=${TOKEN}`);
  await reveal.click();
  await expect.element(reveal).toHaveAttribute("aria-pressed", "false");
});

// The lobby renders it at full width. On a phone the buttons used to share the
// field's row and squeeze it down to "https://", so neither the masked link
// nor a revealed one could be read.
test("on a phone the lobby's field gets a row of its own", async () => {
  await page.viewport(390, 844);
  const screen = await render(
    <div style={{ width: 274 }}>
      <AdminLink boardId={"5".repeat(32)} adminToken={TOKEN} />
    </div>,
  );
  const input = screen.getByTestId("admin-link-input").element();
  const reveal = screen.getByTestId("admin-link-reveal").element();
  const row = input.parentElement!.getBoundingClientRect();
  const field = input.getBoundingClientRect();

  expect(field.width).toBeGreaterThan(row.width - 1);
  expect(reveal.getBoundingClientRect().top).toBeGreaterThanOrEqual(
    field.bottom,
  );
});

test("from sm up the lobby keeps field and buttons on one row", async () => {
  await page.viewport(1024, 768);
  const screen = await render(
    <div style={{ width: 560 }}>
      <AdminLink boardId={"6".repeat(32)} adminToken={TOKEN} />
    </div>,
  );
  const field = screen.getByTestId("admin-link-input").element();
  const copy = screen.getByTestId("admin-link-copy").element();
  expect(copy.getBoundingClientRect().top).toBeLessThan(
    field.getBoundingClientRect().bottom,
  );
});
