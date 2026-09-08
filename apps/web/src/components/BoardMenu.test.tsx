// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { MemoryRouter } from "react-router";
import type { ClientCommand, ServerEvent } from "@retropolis/shared";
import "../i18n.js";
import { ConnectionProvider } from "../lib/connection.js";
import { BoardMenu } from "./BoardMenu.js";

// The export scope only exists in the URL the menu builds. A mistyped query
// parameter still renders a link that looks like it works and downloads the
// wrong thing, so the assertion has to be on the href itself.
// BoardMenu calls useNavigate() for "duplicate board", hence the router.
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
    <MemoryRouter>
      <ConnectionProvider value={connection}>
        <BoardMenu
          boardId={"a".repeat(32)}
          boardName="Sprint 42"
          isAdmin={false}
          gifsEnabled
          cursorsEnabled={false}
          pickerStyle="wheel"
          layout="columns"
          retentionAt={null}
        />
      </ConnectionProvider>
    </MemoryRouter>
  );
}

test("the export scope reaches the download links, and everything is the default", async () => {
  const screen = await render(view());
  await screen.getByTestId("board-menu").click();

  const href = () =>
    screen.getByTestId("export-md").element().getAttribute("href") ?? "";

  // Default: the URL is byte-identical to the one that shipped before scopes.
  expect(href()).toBe(`/api/boards/${"a".repeat(32)}/export?format=md`);
  await expect
    .element(screen.getByTestId("export-scope-all"))
    .toHaveAttribute("aria-pressed", "true");

  await screen.getByTestId("export-scope-summary").click();
  expect(href()).toContain("scope=summary");
  await expect
    .element(screen.getByTestId("export-scope-summary"))
    .toHaveAttribute("aria-pressed", "true");

  // The two export switches are independent.
  await screen.getByRole("checkbox").first().click();
  expect(href()).toContain("scope=summary");
  expect(href()).toContain("authors=true");

  await screen.getByTestId("export-scope-all").click();
  expect(href()).not.toContain("scope=");
  expect(href()).toContain("authors=true");
});
