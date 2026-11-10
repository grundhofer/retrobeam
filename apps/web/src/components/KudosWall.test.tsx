// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import {
  KUDO_EVERYONE,
  type ClientCommand,
  type Kudo,
  type Participant,
  type ServerEvent,
} from "@retrobeam/shared";
import i18n from "../i18n.js";
import "../index.css";
import { ConnectionProvider } from "../lib/connection.js";
import { KudosWall } from "./KudosWall.js";

// The kudos wall in sebaro (plan stage 5d): each kind is an icon and its word,
// removing asks first, „Anonym senden“ keeps its promise (§6.1 f) and „Kudos
// senden“ is the close phase's primary action (F5b).

const anna: Participant = {
  id: "a".repeat(32),
  name: "Anna",
  color: "#000000",
  role: "facilitator",
  online: true,
};
const ben: Participant = {
  ...anna,
  id: "b".repeat(32),
  name: "Ben",
  role: "member",
};

function view(kudos: Kudo[], sent: ClientCommand[]) {
  const connection = {
    boardId: "c".repeat(32),
    send: (command: ClientCommand) => sent.push(command),
    mutate: (
      command: ClientCommand,
      _optimistic: ServerEvent | ServerEvent[],
    ) => sent.push(command),
  };
  return (
    <ConnectionProvider value={connection}>
      <KudosWall
        kudos={kudos}
        roster={[anna, ben]}
        you={anna}
        isAdmin
        gifsEnabled={false}
        readOnly={false}
      />
    </ConnectionProvider>
  );
}

const kudo: Kudo = {
  id: "d".repeat(32),
  cardType: "great-job",
  toId: ben.id,
  fromId: anna.id,
  text: "shipped it",
  gifUrl: null,
};

test("a card shows its kind as icon and word, and removing it asks first", async () => {
  const sent: ClientCommand[] = [];
  const screen = await render(view([kudo], sent));
  const card = screen.getByTestId("kudo-card");
  await expect.element(card).toHaveClass("sb-card");
  await expect.element(card).toHaveTextContent(i18n.t("kudos.card.great-job"));
  expect(card.element().querySelector("svg use")?.getAttribute("href")).toBe(
    "#thumbs-up",
  );

  await screen.getByRole("button", { name: i18n.t("kudos.remove") }).click();
  await expect
    .element(screen.getByRole("button", { name: i18n.t("note.cancel") }))
    .toHaveFocus();
  expect(sent).toEqual([]);
  await screen.getByTestId("kudo-remove-confirm").click();
  expect(sent.map((command) => command.type)).toEqual(["kudo.delete"]);
});

test("sending: labelled fields, the primary action, and anonymous means no sender", async () => {
  const sent: ClientCommand[] = [];
  const screen = await render(view([], sent));
  await expect
    .element(screen.getByLabelText(new RegExp(i18n.t("kudos.reason"))))
    .toBeVisible();
  await expect
    .element(screen.getByTestId("kudo-recipient"))
    .toHaveValue(KUDO_EVERYONE);
  await screen.getByTestId("kudo-text").fill("great sprint");
  await screen
    .getByRole("checkbox", { name: i18n.t("kudos.anonymousSend") })
    .click();
  const send = screen.getByTestId("kudo-send");
  // a secondary action: the view's one primary is the step at the bottom
  // (sebaro D39)
  await expect.element(send).toHaveClass("sb-secondary-action");
  await send.click();
  const created = sent.find((command) => command.type === "kudo.create");
  expect(created && "anonymous" in created ? created.anonymous : null).toBe(
    true,
  );
});
