// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { ClientCommand, Participant } from "@retrobeam/shared";
import i18n from "../i18n.js";
import "../index.css";
import { ConnectionProvider } from "../lib/connection.js";
import { ActionsPanel } from "./ActionsPanel.js";

const anna: Participant = {
  id: "a".repeat(32),
  name: "Anna",
  color: "#E8590C",
  role: "facilitator",
  online: true,
};

async function renderPanel() {
  const sent: ClientCommand[] = [];
  const connection = {
    boardId: "b".repeat(32),
    send: () => {},
    mutate: (command: ClientCommand) => {
      sent.push(command);
    },
  };
  const screen = await render(
    <ConnectionProvider value={connection}>
      <ActionsPanel actions={[]} roster={[anna]} you={anna} readOnly={false} />
    </ConnectionProvider>,
  );
  return { screen, sent };
}

// "Add" is not greyed out while the field is empty (sebaro STA-03): the press
// sends nothing, says at the field what is missing and puts the cursor there.
test("adding an empty action item says so at the field and sends nothing", async () => {
  const { screen, sent } = await renderPanel();
  const field = screen.getByTestId("action-input");
  const add = screen.getByRole("button", { name: i18n.t("action.add") });
  await expect.element(add).toBeEnabled();

  await field.fill("   ");
  // Focus starts elsewhere, so the check below proves the press moved it
  // (WebKit does not focus a clicked button).
  screen.getByTestId("action-owner").element().focus();
  await add.click();
  await expect
    .element(screen.getByText(i18n.t("action.textMissing")))
    .toBeVisible();
  await expect.element(field).toHaveFocus();
  await expect.element(field).toHaveAttribute("aria-invalid", "true");
  await expect
    .element(field)
    .toHaveAccessibleDescription(i18n.t("action.textMissing"));
  await expect.element(screen.getByRole("status")).toBeEmptyDOMElement();
  expect(sent).toEqual([]);

  // Spaces alone leave the field empty, so the message stays.
  await field.fill("  ");
  await expect.element(field).toHaveAttribute("aria-invalid", "true");

  await field.fill("Automate the deploy");
  await expect
    .element(screen.getByText(i18n.t("action.textMissing")))
    .not.toBeInTheDocument();
  await expect.element(field).not.toHaveAttribute("aria-invalid");
  await add.click();
  await expect
    .poll(() => sent.map((command) => command.type))
    .toEqual(["action.create"]);
});

// Enter in the field is the usual way to add; the field already has the focus,
// so a live region says the message.
test("Enter in the empty action item field says the message aloud", async () => {
  const { screen, sent } = await renderPanel();
  const field = screen.getByTestId("action-input");
  await field.click();

  await userEvent.keyboard("{Enter}");
  await expect.element(field).toHaveAttribute("aria-invalid", "true");
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent(i18n.t("action.textMissing"));
  await expect.element(field).toHaveFocus();
  expect(sent).toEqual([]);
});

// The owner may stay empty, so its label says so and "None" is a choice.
test("the owner is labelled optional and can be none", async () => {
  const { screen, sent } = await renderPanel();
  const owner = screen.getByRole("combobox", {
    name: `${i18n.t("action.owner")} ${i18n.t("form.optional")}`,
  });
  await expect.element(owner).toHaveValue(anna.id);
  await owner.selectOptions(i18n.t("action.ownerNone"));
  await screen.getByTestId("action-input").fill("Write it down");
  await screen.getByRole("button", { name: i18n.t("action.add") }).click();
  await expect
    .poll(() => sent[0])
    .toMatchObject({ type: "action.create", ownerId: null });
});
