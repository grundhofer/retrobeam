// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import {
  DEFAULT_PHASE_PLAN,
  type ClientCommand,
  type ServerEvent,
} from "@retrobeam/shared";
import "../i18n.js";
import "../index.css";
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
  const view = (phase: "write" | "present" | "discuss" | "close" | "done") => (
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

test("the finished retro offers no step forward", async () => {
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

  // Nothing comes after "done"; the one way out is back (next test).
  expect(screen.getByTestId("phase-next").elements()).toHaveLength(0);
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

// Below `sm` the old row of phase names was ~560px wide and made every board
// page on a phone scroll sideways. sebaro's steps share the width instead: the
// head says "Step 3 of 7 · Present", every phase keeps its bar, and the
// current one is marked for screen readers as well.
test("a phone gets the position and every step within its width", async () => {
  const { view } = harness();
  await page.viewport(390, 844);
  const screen = await render(view("present"));

  const head = screen.getByTestId("phase-compact");
  await expect.element(head).toBeVisible();
  await expect.element(head).toHaveTextContent(/(Step|Schritt) 3 (of|von) 7/);
  const list = screen.getByRole("list");
  await expect.element(list).toBeVisible();
  expect(list.element().getBoundingClientRect().right).toBeLessThanOrEqual(390);
  const steps = list.element().querySelectorAll("li");
  expect(steps).toHaveLength(7);
  expect(
    list.element().querySelector('[aria-current="step"]')?.textContent,
  ).toMatch(/present|vorstellen/i);
  expect(
    list.element().querySelectorAll('[data-sb-state="done"]'),
  ).toHaveLength(2);
  // sebaro's short form: the words are for screen readers only, so no word
  // breaks inside a bar's narrow column.
  const word = list
    .element()
    .querySelector('[aria-current="step"] .sb-progress__word');
  expect(word?.getBoundingClientRect().width).toBeLessThanOrEqual(1);
  // The controls are not squeezed out by it.
  await expect.element(screen.getByTestId("phase-next")).toBeVisible();
});

// Finishing is the natural next step and can be taken back (owner,
// 2026-11-07, replacing F5b's danger action and dialog): the facilitator's
// primary action finishes at once, and the finished retro offers the step
// back to the closing phase.
test("finishing is the primary action and finishes at once", async () => {
  const { sent, view } = harness();
  const screen = await render(view("close"));

  const next = screen.getByTestId("phase-next");
  await expect.element(next).toHaveAccessibleName(/finish|beenden/i);
  await expect.element(next).toHaveClass(/sb-primary-action/);
  await next.click();
  expect(sent).toEqual([{ type: "admin.phase.set", phase: "done" }]);
});

test("a finished retro opens again one step back", async () => {
  const { sent, view } = harness();
  const screen = await render(view("done"));

  await expect
    .element(screen.getByTestId("phase-next"))
    .not.toBeInTheDocument();
  const back = screen.getByTestId("phase-back");
  await expect.element(back).toHaveAccessibleName(/close|abschluss/i);
  await back.click();
  expect(sent).toEqual([{ type: "admin.phase.set", phase: "close" }]);
});

test("every other step still goes in one click, from the bottom block", async () => {
  const { sent, view } = harness();
  const screen = await render(view("discuss"));
  const next = screen.getByTestId("phase-next");
  await expect.element(next).toHaveClass(/sb-primary-action/);
  expect(next.element().closest(".sb-bottom-block")).not.toBeNull();
  await next.click();
  expect(sent).toEqual([{ type: "admin.phase.set", phase: "close" }]);
});
