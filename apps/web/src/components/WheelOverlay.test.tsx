// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import {
  DEFAULT_PHASE_PLAN,
  type BoardConfig,
  type Participant,
  type PickerState,
  type WheelSpin,
} from "@retrobeam/shared";
import "../i18n.js";
import { ConnectionProvider } from "../lib/connection.js";
import { useBoardStore } from "../store/boardStore.js";
import { WheelOverlay } from "./WheelOverlay.js";

// sebaro (plan §2.4 F7): the choosing moment is drawn flat in ink, in a modal
// dialog, without the participants' colours and without confetti; under
// reduced motion — the system's or sebaro's data-sb-motion — it stands still
// and names the person at once.

const anna: Participant = {
  id: "a".repeat(32),
  name: "Anna",
  color: "#E8590C",
  role: "facilitator",
  online: true,
};
const ben: Participant = {
  id: "b".repeat(32),
  name: "Ben",
  color: "#1971C2",
  role: "member",
  online: true,
};
const picker: PickerState = {
  remaining: [anna.id, ben.id],
  presented: [],
  current: null,
  excluded: [],
  revealed: [],
  revealedAll: false,
};

const config: BoardConfig = {
  anonymous: false,
  phasePlan: DEFAULT_PHASE_PLAN,
  votesPerPerson: 3,
  maxPerTarget: null,
  topN: 3,
  gifsEnabled: false,
  pickerStyle: "wheel",
  layout: "columns",
  cursorsEnabled: false,
  voterNamesEnabled: false,
  focusMode: false,
};

function seed(spin: WheelSpin | null, pickerCards = false) {
  useBoardStore.setState((store) => ({
    clockOffsetMs: 0,
    state: {
      ...store.state,
      roster: [anna, ben],
      picker,
      phase: "present",
      lastSpin: spin,
      config: { ...config, pickerCards },
    },
  }));
}

function overlay(props: React.ComponentProps<typeof WheelOverlay> = {}) {
  return (
    <ConnectionProvider
      value={{ boardId: "c".repeat(32), send: vi.fn(), mutate: vi.fn() }}
    >
      <WheelOverlay {...props} />
    </ConnectionProvider>
  );
}

afterEach(() => {
  useBoardStore.getState().reset();
  delete document.documentElement.dataset.sbMotion;
});

const spinning = (): WheelSpin => ({
  pool: [anna.id, ben.id],
  winnerId: ben.id,
  seed: 7,
  startAt: Date.now(),
  durationMs: 4500,
});

test("the wheel is a modal dialog drawn in ink, not in the room's colours", async () => {
  seed(spinning());
  const screen = await render(overlay());
  const dialog = screen.getByTestId("wheel-overlay");
  await expect.element(dialog).toBeVisible();
  expect((dialog.element() as HTMLDialogElement).matches(":modal")).toBe(true);
  await expect.element(screen.getByTestId("wheel")).toBeInTheDocument();

  // No participant colour and no hard-coded colour anywhere in the drawing:
  // every fill and stroke is one of sebaro's colour roles.
  const painted = [...document.querySelectorAll("[data-testid=wheel] *")]
    .flatMap((node) => {
      const style = (node as SVGElement).style;
      return [
        node.getAttribute("fill"),
        node.getAttribute("stroke"),
        style.fill,
        style.stroke,
      ];
    })
    .filter((value): value is string => value !== null && value !== "");
  expect(painted.length).toBeGreaterThan(0);
  for (const value of painted) expect(value).toMatch(/^var\(--sb-color-/);
  expect(document.querySelector("canvas")).toBeNull(); // no confetti layer
});

test("data-sb-motion=reduce stands the wheel still and names the person at once", async () => {
  document.documentElement.dataset.sbMotion = "reduce";
  seed(spinning());
  const screen = await render(overlay());
  await expect
    .element(screen.getByTestId("wheel-winner"))
    .toHaveTextContent(/Ben/);
  expect(screen.getByTestId("wheel").elements()).toHaveLength(0);
});

test("Escape closes the card choice", async () => {
  seed(null, true);
  const onClose = vi.fn();
  const screen = await render(
    overlay({
      cardSelectionOpen: true,
      isAdmin: true,
      onCloseCardSelection: onClose,
    }),
  );
  await expect.element(screen.getByTestId("card-picker-overlay")).toBeVisible();
  await expect
    .element(screen.getByTestId("picker-card").first())
    .toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledTimes(1);
});

// A spin closes itself on every screen at once; Escape does not end it for one
// person.
test("Escape leaves a running spin alone", async () => {
  seed(spinning());
  const spin = await render(overlay());
  await expect.element(spin.getByTestId("wheel-overlay")).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(spin.getByTestId("wheel-overlay")).toBeVisible();
});
