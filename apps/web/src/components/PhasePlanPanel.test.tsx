// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import type { ClientCommand } from "@retrobeam/shared";
import "../i18n.js";
import { ConnectionProvider } from "../lib/connection.js";
import { PhasePlanPanel } from "./PhasePlanPanel.js";

const plan = {
  checkin: false,
  vote: true,
  discuss: true,
  close: true,
};

function view(sent: ClientCommand[], isAdmin = true, locked = false) {
  return (
    <ConnectionProvider
      value={{
        boardId: "a".repeat(32),
        send: (command) => sent.push(command),
        mutate: () => {},
      }}
    >
      <PhasePlanPanel phasePlan={plan} isAdmin={isAdmin} locked={locked} />
    </ConnectionProvider>
  );
}

test("the facilitator can toggle an optional phase", async () => {
  const sent: ClientCommand[] = [];
  const screen = await render(view(sent));

  await screen.getByTestId("phase-plan-vote").click();

  expect(sent).toEqual([
    {
      type: "admin.phasePlan.set",
      phasePlan: { ...plan, vote: false },
    },
  ]);
  await expect.element(screen.getByTestId("phase-plan-close")).toBeDisabled();
});

test("core phases and the read-only member view cannot be changed", async () => {
  const sent: ClientCommand[] = [];
  const screen = await render(view(sent, false));

  await expect.element(screen.getByTestId("phase-plan-write")).toBeDisabled();
  await expect.element(screen.getByTestId("phase-plan-present")).toBeDisabled();
  await expect.element(screen.getByTestId("phase-plan-vote")).toBeDisabled();
  expect(sent).toEqual([]);
});

test("a previously started retro keeps the plan locked in the lobby", async () => {
  const sent: ClientCommand[] = [];
  const screen = await render(view(sent, true, true));

  await expect.element(screen.getByTestId("phase-plan-checkin")).toBeDisabled();
  await expect.element(screen.getByTestId("phase-plan-hint")).toBeVisible();
});
