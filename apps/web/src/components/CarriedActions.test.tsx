// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import type { Action, Participant } from "@retrobeam/shared";
import "../i18n.js";
import "../index.css";
import { ConnectionProvider } from "../lib/connection.js";
import { ActionsPanel } from "./ActionsPanel.js";
import { CarriedActions } from "./CarriedActions.js";

// A follow-up retro opens on last time's open promises and keeps telling them
// apart from today's. These pin both places that label a carried item.
const carried: Action = {
  id: "1".repeat(32),
  text: "Quarantine the flaky test",
  ownerId: null,
  status: "open",
  carriedFrom: "Sprint 47",
};
const local: Action = {
  id: "2".repeat(32),
  text: "Written today",
  ownerId: null,
  status: "open",
  carriedFrom: null,
};
const anna: Participant = {
  id: "a".repeat(32),
  name: "Anna",
  color: "#E8590C",
  role: "facilitator",
  online: true,
};

test("the lobby card lists only carried items, naming the previous retro", async () => {
  const screen = await render(<CarriedActions actions={[carried, local]} />);
  await expect.element(screen.getByTestId("carried-actions")).toBeVisible();
  const items = screen.getByTestId("carried-action");
  expect(items.elements()).toHaveLength(1);
  await expect.element(items).toHaveTextContent("Quarantine the flaky test");
  await expect.element(screen.getByText(/Sprint 47/)).toBeVisible();
});

test("the lobby card renders nothing on a board that carried nothing", async () => {
  const screen = await render(<CarriedActions actions={[local]} />);
  expect(
    screen.container.querySelector('[data-testid="carried-actions"]'),
  ).toBeNull();
});

test("the Action Items panel labels a carried item and only that one", async () => {
  const connection = {
    boardId: "b".repeat(32),
    send: () => {},
    mutate: () => {},
  };
  const screen = await render(
    <ConnectionProvider value={connection}>
      <ActionsPanel
        actions={[carried, local]}
        roster={[anna]}
        you={anna}
        readOnly={false}
      />
    </ConnectionProvider>,
  );
  const labels = screen.getByTestId("action-carried");
  expect(labels.elements()).toHaveLength(1);
  // Either UI language: the engines run with different browser locales.
  await expect
    .element(labels)
    .toHaveTextContent(/^(from “|aus „)Sprint 47(”|“)$/);
});
