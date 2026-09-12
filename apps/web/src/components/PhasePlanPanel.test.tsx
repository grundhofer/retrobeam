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
      <PhasePlanPanel
        phasePlan={plan}
        isAdmin={isAdmin}
        locked={locked}
        icebreakerId={null}
        workingAgreements=""
      />
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

test("check-in setup stays in the facilitator's lobby", async () => {
  const sent: ClientCommand[] = [];
  const screen = await render(
    <ConnectionProvider
      value={{
        boardId: "a".repeat(32),
        send: (command) => sent.push(command),
        mutate: () => {},
      }}
    >
      <PhasePlanPanel
        phasePlan={{ ...plan, checkin: true }}
        isAdmin
        locked={false}
        icebreakerId={null}
        workingAgreements=""
      />
    </ConnectionProvider>,
  );

  await screen.getByTestId("checkin-question-select").selectOptions("weather");
  await screen.getByTestId("agreements-edit").click();
  await screen.getByTestId("agreements-input").fill("Listen first.");
  await screen.getByRole("button", { name: /save|speichern/i }).click();

  expect(sent).toEqual([
    {
      type: "admin.checkin.question.set",
      icebreakerId: "weather",
    },
    { type: "admin.agreements.set", text: "Listen first." },
  ]);
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
