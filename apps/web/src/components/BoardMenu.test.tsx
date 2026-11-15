// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { MemoryRouter, Route, Routes } from "react-router";
import {
  parseTemplateLinkColumns,
  type ClientCommand,
  type Column,
  type ServerEvent,
} from "@retrobeam/shared";
import i18n from "../i18n.js";
import "../index.css";
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
          anonymous={false}
          columns={columns}
          settingsPath="/board/settings"
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
  await screen.getByTestId("export-open").click();
  // `href()` below reads `.element()` synchronously — no retry of its own — so
  // the dialog's React re-render has to be committed before we get there.
  await expect.element(screen.getByTestId("export-md")).toBeVisible();

  const href = () =>
    screen.getByTestId("export-md").element().getAttribute("href") ?? "";

  // Default: the URL is byte-identical to the one that shipped before scopes.
  expect(href()).toBe(`/api/boards/${"a".repeat(32)}/export?format=md`);
  await expect.element(screen.getByTestId("export-scope-all")).toBeChecked();

  await screen.getByTestId("export-scope-summary").click();
  expect(href()).toContain("scope=summary");
  await expect
    .element(screen.getByTestId("export-scope-summary"))
    .toBeChecked();

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
    await screen.getByTestId("template-link-open").click();
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
  await expect.element(member.getByTestId("export-open")).toBeVisible();
  await expect
    .element(member.getByTestId("template-link-open"))
    .not.toBeInTheDocument();
  await member.unmount();

  const nine = Array.from({ length: 9 }, (_, i) => column(`Column ${i}`, i));
  const screen = await render(view({ isAdmin: true, columns: nine }));
  await screen.getByTestId("board-menu").click();
  await screen.getByTestId("template-link-open").click();
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
  await screen.getByTestId("template-link-open").click();
  await expect.element(screen.getByTestId("template-link-copy")).toBeDisabled();
  await expect
    .element(screen.getByText(i18n.t("menu.templateLinkNoVisible")))
    .toBeVisible();
  await expect
    .element(screen.getByText(i18n.t("menu.templateLinkHint")))
    .not.toBeInTheDocument();
});

// sebaro's menu (spec/02 §4.10), ported to React: the button opens it on the
// first row, the arrows move and wrap, Escape closes it and hands the focus
// back; the deletion row is last, after a hairline, and asks first.
test("the menu works by keyboard alone, and deleting asks first", async () => {
  const sent: ClientCommand[] = [];
  const connection = {
    boardId: "a".repeat(32),
    send: (command: ClientCommand) => sent.push(command),
    mutate: (
      command: ClientCommand,
      _optimistic: ServerEvent | ServerEvent[],
    ) => sent.push(command),
  };
  const screen = await render(
    <MemoryRouter>
      <ConnectionProvider value={connection}>
        <BoardMenu
          boardId={"a".repeat(32)}
          boardName="Sprint 42"
          isAdmin
          anonymous={false}
          columns={[]}
          settingsPath="/board/settings"
        />
      </ConnectionProvider>
    </MemoryRouter>,
  );
  const trigger = screen.getByTestId("board-menu");
  await expect.element(trigger).toHaveAttribute("aria-haspopup", "menu");
  await trigger.click();
  await expect.element(trigger).toHaveAttribute("aria-expanded", "true");
  const rows = screen.getByRole("menuitem");
  await expect.element(rows.first()).toHaveFocus();
  await userEvent.keyboard("{ArrowUp}");
  await expect.element(screen.getByTestId("delete-board")).toHaveFocus();
  await expect
    .element(screen.getByTestId("delete-board"))
    .toHaveClass("sb-menu__item", "sb-menu__item--danger");
  await userEvent.keyboard("{ArrowDown}");
  await expect.element(rows.first()).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
  await expect.element(trigger).toHaveFocus();

  await trigger.click();
  await screen.getByTestId("delete-board").click();
  const dialog = screen.getByTestId("delete-dialog");
  await expect.element(dialog).toHaveTextContent("Sprint 42");
  await expect
    .element(screen.getByRole("button", { name: i18n.t("note.cancel") }))
    .toHaveFocus();
  await userEvent.keyboard("{Escape}");
  expect(sent).toEqual([]);

  await trigger.click();
  await screen.getByTestId("delete-board").click();
  await screen.getByTestId("delete-board-confirm").click();
  expect(sent).toEqual([{ type: "admin.board.delete" }]);
});

// Round 7 (sebaro spec/03 §6.6): „Mehr“ is the head's one menu. After the
// board's rows come „Hell oder Dunkel“, „Farbton“ and „Sprache“, each a
// submenu of radio items, then „Einstellungen“; deleting stays last.
test("„Mehr“ opens its submenus by keyboard, and a choice applies and closes the menu", async () => {
  const screen = await render(view({ isAdmin: true }));
  const trigger = screen.getByTestId("board-menu");
  await trigger.click();
  const top = document.getElementById(
    trigger.element().getAttribute("popovertarget")!,
  )!;
  const order = [...top.children].map((li) =>
    li.getAttribute("role") === "separator"
      ? "separator"
      : li.firstElementChild?.getAttribute("data-testid"),
  );
  expect(order.slice(-7)).toEqual([
    "menu-theme",
    "menu-tone",
    "menu-language",
    "separator",
    "menu-settings",
    "separator",
    "delete-board",
  ]);
  const themeRow = screen.getByTestId("menu-theme");
  await expect.element(themeRow).toHaveAttribute("aria-haspopup", "menu");
  (themeRow.element() as HTMLElement).focus();
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(themeRow).toHaveAttribute("aria-expanded", "true");
  await expect.element(screen.getByTestId("menu-theme-system")).toHaveFocus();
  await expect
    .element(screen.getByTestId("menu-theme-system"))
    .toHaveAttribute("aria-checked", "true");
  // ArrowLeft goes back to the row; the menu stays open
  await userEvent.keyboard("{ArrowLeft}");
  await expect.element(themeRow).toHaveFocus();
  await expect.element(themeRow).toHaveAttribute("aria-expanded", "false");
  await expect.element(trigger).toHaveAttribute("aria-expanded", "true");
  await userEvent.keyboard("{ArrowRight}{ArrowDown}{ArrowDown}");
  await expect.element(screen.getByTestId("menu-theme-dark")).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  try {
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("sb-theme")).toBe("dark");
    await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
    await expect.element(trigger).toHaveFocus();
    // the tone's items carry sebaro's hook, which sb-tone.js acts on
    await trigger.click();
    expect(
      screen
        .getByTestId("menu-tone-warm")
        .element()
        .getAttribute("data-sb-tone-item"),
    ).toBe("warm");
    await expect
      .element(screen.getByTestId("menu-theme-dark"))
      .toHaveAttribute("aria-checked", "true");
  } finally {
    delete document.documentElement.dataset.theme;
    localStorage.removeItem("sb-theme");
  }
});

test("„Einstellungen“ opens the board's settings view", async () => {
  const screen = await render(
    <MemoryRouter initialEntries={["/board"]}>
      <ConnectionProvider
        value={{ boardId: "a".repeat(32), send: () => {}, mutate: () => {} }}
      >
        <Routes>
          <Route
            path="/board"
            element={
              <BoardMenu
                boardId={"a".repeat(32)}
                boardName="Sprint 42"
                isAdmin={false}
                anonymous={false}
                columns={[]}
                settingsPath="/board/settings"
              />
            }
          />
          <Route path="/board/settings" element={<p>the settings view</p>} />
        </Routes>
      </ConnectionProvider>
    </MemoryRouter>,
  );
  await screen.getByTestId("board-menu").click();
  await screen.getByTestId("menu-settings").click();
  await expect
    .element(screen.getByText("the settings view"))
    .toBeInTheDocument();
});

// D95: where a submenu fits beside the menu on neither side, it takes the
// menu's place with a back row named „Zurück zu Mehr“.
test("on a phone a submenu takes the menu's place, and its back row goes back", async () => {
  await page.viewport(390, 844);
  const screen = await render(view());
  await screen.getByTestId("board-menu").click();
  await screen.getByTestId("menu-language").click();
  const back = screen.getByRole("menuitem", {
    name: i18n.t("menu.backTo", { name: i18n.t("menu.more") }),
  });
  await expect.element(back).toBeInTheDocument();
  // on its first choice, after the back row
  await expect.element(screen.getByTestId("menu-language-de")).toHaveFocus();
  const sub = back.element().closest(".sb-menu") as HTMLElement;
  const parent = sub.parentElement!.closest(".sb-menu") as HTMLElement;
  expect(parent.hasAttribute("data-sb-replaced")).toBe(true);
  expect(Math.round(sub.getBoundingClientRect().left)).toBe(
    Math.round(parent.getBoundingClientRect().left),
  );
  await back.click();
  await expect.element(screen.getByTestId("menu-language")).toHaveFocus();
  expect(parent.hasAttribute("data-sb-replaced")).toBe(false);
});
