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

// Below `sm` the full row of phase names was ~560px wide and made every board
// page on a phone scroll sideways. The phone gets "Step 3 of 7 · Present"; the
// list itself stays in the accessibility tree, current step and all, so a
// screen reader hears the same agenda at every width.
test("a phone gets the position, the phase list stays for screen readers", async () => {
  const { view } = harness();
  await page.viewport(390, 844);
  const screen = await render(view("present"));

  const compact = screen.getByTestId("phase-compact");
  await expect.element(compact).toBeVisible();
  await expect
    .element(compact)
    .toHaveTextContent(/(Step|Schritt) 3 (of|von) 7/);
  const list = screen.getByRole("list");
  await expect.element(list).toBeInTheDocument();
  expect(list.element().getBoundingClientRect().width).toBeLessThanOrEqual(1);
  expect(
    list.element().querySelector('[aria-current="step"]')?.textContent,
  ).toMatch(/present|vorstellen/i);
  // The controls are not squeezed out by it.
  await expect.element(screen.getByTestId("phase-next")).toBeVisible();

  // From `sm` up, the row as it always was.
  await page.viewport(1024, 768);
  await expect.element(compact).not.toBeVisible();
  expect(list.element().getBoundingClientRect().width).toBeGreaterThan(300);
});

// Finishing cannot be undone and freezes the board for everyone, and it used to
// be one click on the same button that walks every other phase. It asks now —
// and only for that step.
test("finishing asks first, and only the confirmation finishes", async () => {
  const { sent, view } = harness();
  const screen = await render(view("close"));

  const next = screen.getByTestId("phase-next");
  await expect.element(next).toHaveAccessibleName(/done|fertig/i);
  await next.click();
  expect(sent).toEqual([]);
  await expect
    .element(screen.getByTestId("phase-done-question"))
    .toHaveTextContent(/read-only|schreibgeschützt/);
  await expect.element(next).toHaveAttribute("aria-expanded", "true");
  await expect.element(next).toHaveAccessibleName(/^(cancel|abbrechen)$/i);

  await screen.getByTestId("phase-done-confirm").click();
  expect(sent).toEqual([{ type: "admin.phase.set", phase: "done" }]);
});

test("cancelling the finish sends nothing and puts the button back", async () => {
  const { sent, view } = harness();
  const screen = await render(view("close"));

  const next = screen.getByTestId("phase-next");
  await next.click();
  await expect.element(screen.getByTestId("phase-done-confirm")).toBeVisible();
  await next.click();
  await expect.element(next).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByTestId("phase-done-confirm").elements()).toHaveLength(0);
  expect(sent).toEqual([]);
});

// The BoardMenu rule: the confirmation must never appear where the first click
// was, or a double click on "Next: Done" confirms its own question. The trigger
// keeps its box when it flips to "Cancel", and the confirmation is elsewhere.
test("a double click on the finish button cancels instead of finishing", async () => {
  const { sent, view } = harness();
  const screen = await render(view("close"));

  const next = screen.getByTestId("phase-next");
  const before = next.element().getBoundingClientRect();
  await next.click();
  const confirm = screen.getByTestId("phase-done-confirm");
  await expect.element(confirm).toBeVisible();
  const after = next.element().getBoundingClientRect();
  expect(after.width).toBeCloseTo(before.width, 0);
  expect(after.left).toBeCloseTo(before.left, 0);
  const box = confirm.element().getBoundingClientRect();
  const overlaps =
    box.left < before.right &&
    box.right > before.left &&
    box.top < before.bottom &&
    box.bottom > before.top;
  expect(overlaps).toBe(false);

  await next.click();
  expect(sent).toEqual([]);
});

test("every other step still goes in one click", async () => {
  const { sent, view } = harness();
  const screen = await render(view("discuss"));
  await screen.getByTestId("phase-next").click();
  expect(sent).toEqual([{ type: "admin.phase.set", phase: "close" }]);
  expect(screen.getByTestId("phase-done-question").elements()).toHaveLength(0);
});

// In the header the stepper is centred (an `mx-auto` wrapper in a flex row).
// The question used to share the phase row, whose intrinsic width counted one
// more gap for it even at zero width, so the centred stepper grew 12px and the
// trigger slid 6px left as it flipped to "Cancel" — the rightmost 6px of a
// double click's first press then missed it on the second.
test("in a centred header the finish trigger stays where it was clicked", async () => {
  const { sent, view } = harness();
  await page.viewport(1440, 900);
  const screen = await render(
    <div className="flex w-[1200px] items-center">
      <div className="mx-auto">{view("close")}</div>
    </div>,
  );

  const next = screen.getByTestId("phase-next");
  const before = next.element().getBoundingClientRect();
  await next.click();
  await expect.element(screen.getByTestId("phase-done-confirm")).toBeVisible();
  const after = next.element().getBoundingClientRect();
  expect(after.left).toBeCloseTo(before.left, 1);
  expect(after.width).toBeCloseTo(before.width, 1);
  expect(sent).toEqual([]);
});

// The question is remembered as the phase it was asked in. Stepping away and
// back used to find it still open — the one irreversible button on screen
// without anybody having asked for it.
test("stepping away and back does not bring the finish question back", async () => {
  const { view } = harness();
  const screen = await render(view("close"));

  await screen.getByTestId("phase-next").click();
  await expect.element(screen.getByTestId("phase-done-confirm")).toBeVisible();

  await screen.rerender(view("discuss")); // a rewind, by anyone
  await screen.rerender(view("close"));

  expect(screen.getByTestId("phase-done-question").elements()).toHaveLength(0);
  await expect
    .element(screen.getByTestId("phase-next"))
    .toHaveAttribute("aria-expanded", "false");
});
