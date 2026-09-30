// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { MemoryRouter } from "react-router";
import {
  parseTemplateLinkColumns,
  type ClientCommand,
  type Column,
  type ServerEvent,
} from "@retrobeam/shared";
import i18n from "../i18n.js";
import { ConnectionProvider } from "../lib/connection.js";
import { BoardMenu } from "./BoardMenu.js";

// The export scope only exists in the URL the menu builds. A mistyped query
// parameter still renders a link that looks like it works and downloads the
// wrong thing, so the assertion has to be on the href itself.
// BoardMenu calls useNavigate() for "duplicate board", hence the router.
function view({
  isAdmin = false,
  columns = [],
}: { isAdmin?: boolean; columns?: Column[] } = {}) {
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
          isAdmin={isAdmin}
          gifsEnabled
          cursorsEnabled={false}
          voterNamesEnabled={false}
          anonymous={false}
          phase="write"
          layout="columns"
          retentionAt={null}
          columns={columns}
        />
      </ConnectionProvider>
    </MemoryRouter>
  );
}

test("the export scope reaches the download links, and everything is the default", async () => {
  const screen = await render(view());
  // Two barriers, both load-bearing under the three-engine run. Firefox needs
  // the trigger to be really interactive before the click counts, and it has
  // not committed the menu's React re-render by the time `href()` below reads
  // `.element()` synchronously — that read has no retry of its own.
  const trigger = screen.getByTestId("board-menu");
  await expect.element(trigger).toBeVisible();
  await trigger.click();
  // `href()` below reads `.element()` synchronously — no retry of its own — so
  // the menu's React re-render has to be committed before we get there.
  await expect.element(screen.getByTestId("export-md")).toBeVisible();

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

function column(name: string, order: number, hidden = false): Column {
  return {
    id: String(order).padStart(32, "0"),
    name,
    order,
    hidden,
    rect: null,
  };
}

// The template link may leave the room — pasted into a wiki, sent to another
// team. A staged column is the facilitator's surprise for later in THIS retro,
// so its name must never be in the link.
test("the template link carries the visible column names only, in board order", async () => {
  const writeText = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue(undefined);
  try {
    const screen = await render(
      view({
        isAdmin: true,
        columns: [
          column("Ideas & wishes", 2),
          column("Went well", 0),
          column("Secret surprise", 1, true),
        ],
      }),
    );
    await screen.getByTestId("board-menu").click();
    const button = screen.getByTestId("template-link-copy");
    await expect.element(button).toHaveTextContent(i18n.t("menu.templateLink"));
    await button.click();
    await expect.poll(() => writeText.mock.calls.length).toBe(1);
    const url = new URL(String(writeText.mock.calls[0]?.[0]));
    expect(url.origin).toBe(location.origin);
    expect(url.pathname).toBe("/new");
    expect([...url.searchParams.keys()]).toEqual(["columns"]);
    expect(url.href).not.toContain("Secret");
    expect(
      parseTemplateLinkColumns(url.searchParams.get("columns") ?? ""),
    ).toEqual(["Went well", "Ideas & wishes"]);
    await expect.element(button).toHaveTextContent(i18n.t("board.copied"));
  } finally {
    writeText.mockRestore();
  }
});

test("the template link is the facilitator's, and refuses a set /new would reject", async () => {
  const member = await render(view({ columns: [column("Went well", 0)] }));
  await member.getByTestId("board-menu").click();
  await expect.element(member.getByTestId("export-md")).toBeVisible();
  await expect
    .element(member.getByTestId("template-link-copy"))
    .not.toBeInTheDocument();
  await member.unmount();

  const nine = Array.from({ length: 9 }, (_, i) => column(`Column ${i}`, i));
  const screen = await render(view({ isAdmin: true, columns: nine }));
  await screen.getByTestId("board-menu").click();
  await expect.element(screen.getByTestId("template-link-copy")).toBeDisabled();
  await expect
    .element(screen.getByText(i18n.t("menu.templateLinkTooMany", { max: 8 })))
    .toBeVisible();
});

test("with every column staged, the template link says why it is locked", async () => {
  const screen = await render(
    view({
      isAdmin: true,
      columns: [column("Surprise", 0, true), column("Later", 1, true)],
    }),
  );
  await screen.getByTestId("board-menu").click();
  await expect.element(screen.getByTestId("template-link-copy")).toBeDisabled();
  await expect
    .element(screen.getByText(i18n.t("menu.templateLinkNoVisible")))
    .toBeVisible();
  await expect
    .element(screen.getByText(i18n.t("menu.templateLinkHint")))
    .not.toBeInTheDocument();
});
