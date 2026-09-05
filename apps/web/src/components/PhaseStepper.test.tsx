// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import {
  DEFAULT_PHASE_PLAN,
  type ClientCommand,
  type ServerEvent,
} from "@retropolis/shared";
import "../i18n.js";
import { ConnectionProvider } from "../lib/connection.js";
import { PhaseStepper } from "./PhaseStepper.js";

// A phase step is a round trip and the target is derived from the phase we
// currently believe we are in. Two clicks before `phase.changed` lands would
// derive the SAME target twice; the server refuses the self-transition, the
// rejection costs a full resync, and the room silently misses a step. This is
// what made the m3 e2e spec flaky on a loaded machine.
function harness() {
  const sent: ClientCommand[] = [];
  const connection = {
    boardId: "a".repeat(32),
    send: (command: ClientCommand) => sent.push(command),
    mutate: (
      command: ClientCommand,
      _optimistic: ServerEvent | ServerEvent[],
    ) => sent.push(command),
  };
  const view = (phase: "write" | "present") => (
    <ConnectionProvider value={connection}>
      <PhaseStepper phase={phase} phasePlan={DEFAULT_PHASE_PLAN} isAdmin />
    </ConnectionProvider>
  );
  return { sent, view };
}

test("a double click sends exactly one phase step", async () => {
  const { sent, view } = harness();
  const screen = await render(view("write"));

  const next = screen.getByTestId("phase-next");
  await next.click();
  expect(sent).toEqual([{ type: "admin.phase.set", phase: "present" }]);

  // The button is locked until the server confirms, so the second click cannot
  // re-send "present" (nor land on a stale target).
  await expect.element(next).toBeDisabled();
  await expect.element(screen.getByTestId("phase-back")).toBeDisabled();
  expect(sent).toHaveLength(1);
});

test("the controls unlock and retarget once the server confirms the phase", async () => {
  const { sent, view } = harness();
  const screen = await render(view("write"));

  await screen.getByTestId("phase-next").click();
  await expect.element(screen.getByTestId("phase-next")).toBeDisabled();

  await screen.rerender(view("present"));

  const next = screen.getByTestId("phase-next");
  await expect.element(next).toBeEnabled();
  await next.click();
  expect(sent).toEqual([
    { type: "admin.phase.set", phase: "present" },
    { type: "admin.phase.set", phase: "vote" },
  ]);
});

test("the terminal phase offers no step the server would refuse", async () => {
  const { sent } = harness();
  const screen = await render(
    <ConnectionProvider
      value={{
        boardId: "a".repeat(32),
        send: (c: ClientCommand) => sent.push(c),
        mutate: () => {},
      }}
    >
      <PhaseStepper phase="done" phasePlan={DEFAULT_PHASE_PLAN} isAdmin />
    </ConnectionProvider>,
  );

  // "done" is terminal in canTransition, so a rewind button here could only
  // ever produce an INVALID reject plus a wasted full resync.
  expect(screen.getByTestId("phase-next").elements()).toHaveLength(0);
  expect(screen.getByTestId("phase-back").elements()).toHaveLength(0);
});

test("members get no phase controls at all", async () => {
  const { sent } = harness();
  const screen = await render(
    <ConnectionProvider
      value={{
        boardId: "a".repeat(32),
        send: (c: ClientCommand) => sent.push(c),
        mutate: () => {},
      }}
    >
      <PhaseStepper
        phase="write"
        phasePlan={DEFAULT_PHASE_PLAN}
        isAdmin={false}
      />
    </ConnectionProvider>,
  );

  expect(screen.getByTestId("phase-next").elements()).toHaveLength(0);
  expect(screen.getByTestId("phase-back").elements()).toHaveLength(0);
});
