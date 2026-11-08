// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import type { ClientCommand, Phase, ServerEvent } from "@retrobeam/shared";
import i18n from "../i18n.js";
import "../index.css";
import { ConnectionProvider } from "../lib/connection.js";
import { BoardSettings } from "./BoardSettings.js";

function view({
  isAdmin = true,
  anonymous = false,
  phase = "write" as Phase,
  voterNamesEnabled = false,
  retentionAt = null as number | null,
} = {}) {
  const sent: ClientCommand[] = [];
  const connection = {
    boardId: "a".repeat(32),
    send: (command: ClientCommand) => sent.push(command),
    mutate: (
      command: ClientCommand,
      _optimistic: ServerEvent | ServerEvent[],
    ) => sent.push(command),
  };
  const element = (
    <ConnectionProvider value={connection}>
      <BoardSettings
        isAdmin={isAdmin}
        gifsEnabled
        cursorsEnabled={false}
        voterNamesEnabled={voterNamesEnabled}
        anonymous={anonymous}
        phase={phase}
        layout="columns"
        retentionAt={retentionAt}
      />
    </ConnectionProvider>
  );
  return { sent, element };
}

// sebaro's switch: a button with role switch, its state in aria-checked, and
// every change applied at once (no save button).
test("a switch applies at once and says its state", async () => {
  const { sent, element } = view();
  const screen = await render(element);
  const gifs = screen.getByTestId("gifs-toggle");
  await expect.element(gifs).toHaveAttribute("role", "switch");
  await expect.element(gifs).toHaveAttribute("aria-checked", "true");
  await expect.element(gifs).toHaveAccessibleName(i18n.t("menu.gifsEnabled"));
  await gifs.click();
  expect(sent).toEqual([{ type: "admin.gifs.set", enabled: false }]);
});

// Plan §6.1 c: on an anonymous board the switch is locked with a visible
// reason; once voting has started it can only be switched off.
test("voter names: locked with its reason, and one-way once voting started", async () => {
  const anonymous = await render(view({ anonymous: true }).element);
  const locked = anonymous.getByTestId("voter-names-toggle");
  await expect.element(locked).toBeDisabled();
  await expect
    .element(locked)
    .toHaveAccessibleDescription(i18n.t("menu.voterNamesAnonymous"));
  await anonymous.unmount();

  const off = await render(view({ phase: "vote" }).element);
  await expect.element(off.getByTestId("voter-names-toggle")).toBeDisabled();
  await expect
    .element(off.getByTestId("voter-names-toggle"))
    .toHaveAccessibleDescription(i18n.t("menu.voterNamesLocked"));
  await off.unmount();

  const { sent, element } = view({ phase: "vote", voterNamesEnabled: true });
  const on = await render(element);
  const toggle = on.getByTestId("voter-names-toggle");
  await expect.element(toggle).toBeEnabled();
  await toggle.click();
  expect(sent).toEqual([{ type: "admin.voterNames.set", enabled: false }]);
});

test("the layout is a segmented choice that applies at once", async () => {
  const { sent, element } = view();
  const screen = await render(element);
  await expect.element(screen.getByTestId("layout-columns")).toBeChecked();
  await screen.getByTestId("layout-canvas").click();
  expect(sent).toEqual([{ type: "admin.layout.set", layout: "canvas" }]);
});

test("a board with a deletion date can be kept", async () => {
  const { sent, element } = view({ retentionAt: Date.UTC(2027, 0, 31) });
  const screen = await render(element);
  const keep = screen.getByTestId("keep-board");
  await expect.element(keep).toHaveAttribute("aria-checked", "false");
  await expect.element(keep).toHaveAccessibleDescription(/2027-01-31/);
  await keep.click();
  expect(sent).toEqual([{ type: "admin.board.keep" }]);
});

// Both ways (owner, 2026-11-07): a kept board may delete itself again.
test("a kept board can be set to delete itself again", async () => {
  const { sent, element } = view({ retentionAt: null });
  const screen = await render(element);
  const keep = screen.getByTestId("keep-board");
  await expect.element(keep).toHaveAttribute("aria-checked", "true");
  await keep.click();
  expect(sent).toEqual([{ type: "admin.board.autoDelete" }]);
});

// Everyone has the language; the board's switches are the facilitator's.
test("a participant sees the language, not the board's switches", async () => {
  const screen = await render(view({ isAdmin: false }).element);
  await expect
    .element(screen.getByRole("heading", { level: 1 }))
    .toHaveTextContent(i18n.t("settings.title"));
  await expect
    .element(screen.getByRole("radio", { name: "Deutsch" }))
    .toBeVisible();
  expect(screen.getByTestId("gifs-toggle").elements()).toHaveLength(0);
  expect(screen.getByTestId("layout-columns").elements()).toHaveLength(0);
});
