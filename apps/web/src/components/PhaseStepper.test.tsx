// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
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
  const view = (phase: "write" | "present" | "discuss" | "close") => (
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

// Finishing cannot be undone and freezes the board for everyone. It asks like
// a deletion (F5b, sebaro D102 (43)): a danger action that opens a modal
// confirmation dialog, and only the dialog's own button finishes.
// Open, or absent: once finishing is no longer the next step the dialog is
// not rendered at all.
const dialogOpen = (_screen: unknown) =>
  document.querySelector<HTMLDialogElement>(
    '[data-testid="phase-done-question"]',
  )?.open ?? false;

test("finishing asks first, and only the confirmation finishes", async () => {
  const { sent, view } = harness();
  const screen = await render(view("close"));

  const next = screen.getByTestId("phase-next");
  await expect.element(next).toHaveAccessibleName(/finish|beenden/i);
  await expect.element(next).toHaveClass(/sb-danger-action/);
  await next.click();
  expect(sent).toEqual([]);
  expect(dialogOpen(screen)).toBe(true);
  await expect
    .element(screen.getByTestId("phase-done-question"))
    .toHaveTextContent(/read-only|schreibgeschützt/);

  await screen.getByTestId("phase-done-confirm").click();
  expect(sent).toEqual([{ type: "admin.phase.set", phase: "done" }]);
  expect(dialogOpen(screen)).toBe(false);
});

test("cancelling the finish sends nothing and closes the dialog", async () => {
  const { sent, view } = harness();
  const screen = await render(view("close"));

  await screen.getByTestId("phase-next").click();
  // „Abbrechen“ comes first and takes the focus, as in every confirmation.
  const cancel = screen.getByRole("button", { name: /^(cancel|abbrechen)$/i });
  await expect.element(cancel).toHaveFocus();
  await cancel.click();
  expect(dialogOpen(screen)).toBe(false);
  expect(sent).toEqual([]);

  // Escape closes it as well.
  await screen.getByTestId("phase-next").click();
  expect(dialogOpen(screen)).toBe(true);
  await userEvent.keyboard("{Escape}");
  await expect.poll(() => dialogOpen(screen)).toBe(false);
  expect(sent).toEqual([]);
});

// The rule the inline question had: the confirmation must never be where the
// first click was, or a double click confirms its own question. The dialog is
// modal and centred, so a second press on the trigger's spot lands on the
// backdrop or the dialog's frame, never on the confirmation.
test("a double click on the finish button does not finish", async () => {
  const { sent, view } = harness();
  const screen = await render(view("close"));

  const next = screen.getByTestId("phase-next");
  const before = next.element().getBoundingClientRect();
  await next.click();
  const box = screen
    .getByTestId("phase-done-confirm")
    .element()
    .getBoundingClientRect();
  const overlaps =
    box.left < before.right &&
    box.right > before.left &&
    box.top < before.bottom &&
    box.bottom > before.top;
  expect(overlaps).toBe(false);
  expect(sent).toEqual([]);
});

test("every other step still goes in one click, from the bottom block", async () => {
  const { sent, view } = harness();
  const screen = await render(view("discuss"));
  const next = screen.getByTestId("phase-next");
  await expect.element(next).toHaveClass(/sb-primary-action/);
  expect(next.element().closest(".sb-bottom-block")).not.toBeNull();
  await next.click();
  expect(sent).toEqual([{ type: "admin.phase.set", phase: "close" }]);
  expect(dialogOpen(screen)).toBe(false);
});

// The question is remembered as the phase it was asked in. A phase change by
// anyone closes it (F5b), and stepping back must not open it unasked.
test("a phase change closes the finish dialog, and coming back keeps it shut", async () => {
  const { view } = harness();
  const screen = await render(view("close"));

  await screen.getByTestId("phase-next").click();
  expect(dialogOpen(screen)).toBe(true);

  await screen.rerender(view("discuss")); // a rewind, by anyone
  await expect.poll(() => dialogOpen(screen)).toBe(false);
  await screen.rerender(view("close"));
  expect(dialogOpen(screen)).toBe(false);
});
