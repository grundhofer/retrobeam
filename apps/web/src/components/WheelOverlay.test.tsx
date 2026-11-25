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
import { toneIndex, WheelOverlay, wheelLabel } from "./WheelOverlay.js";

// sebaro (plan §2.4 F7): the choosing moment is drawn flat, in a modal
// dialog, without the participants' own colours and without confetti; since
// 2026-11-15 (owner) every name in the draw has one of sebaro's six category
// tones. Under reduced motion — the system's or sebaro's data-sb-motion — it
// stands still and names the person at once.

const anna: Participant = {
  id: "a".repeat(32),
  name: "Anna",
  tone: 1,
  role: "facilitator",
  online: true,
};
const ben: Participant = {
  id: "b".repeat(32),
  name: "Ben",
  tone: 2,
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

test("the wheel is sebaro's wheel in a modal dialog, in sebaro's tones, not the room's colours", async () => {
  seed(spinning());
  const screen = await render(overlay());
  const dialog = screen.getByTestId("wheel-overlay");
  await expect.element(dialog).toBeVisible();
  expect((dialog.element() as HTMLDialogElement).matches(":modal")).toBe(true);
  const wheel = await expect
    .poll(() => document.querySelector("[data-testid=wheel]"))
    .not.toBeNull()
    .then(() => document.querySelector("[data-testid=wheel]")!);
  expect(wheel.classList.contains("sb-wheel")).toBe(true);
  expect(wheel.getAttribute("role")).toBe("img");
  expect(wheel.getAttribute("aria-label")).toMatch(
    /(Wheel with|Glücksrad mit) 2 /,
  );

  // One wedge per name, each in its own category tone; everything else is
  // ink (currentColor) or unpainted. A participant's own colour is nowhere.
  const wedges = [...document.querySelectorAll("[data-testid=wheel-wedge]")];
  expect(wedges.map((w) => (w as SVGElement).style.fill)).toEqual([
    expect.stringContaining("var(--sb-category-1)"),
    expect.stringContaining("var(--sb-category-2)"),
  ]);
  const painted = [...document.querySelectorAll("[data-testid=wheel] *")]
    .filter((node) => node.getAttribute("data-testid") !== "wheel-wedge")
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
  expect(new Set(painted)).toEqual(new Set(["currentcolor", "none"]));
  const markup = document.querySelector("[data-testid=wheel]")!.outerHTML;
  // No person tone paints a wedge either.
  expect(markup).not.toContain("--sb-person");
  expect(document.querySelector("canvas")).toBeNull(); // no confetti layer
});

test("a wheel of one name has pegs on its turning disc, so it is seen to spin", async () => {
  seed({ ...spinning(), pool: [ben.id] });
  await render(overlay());
  const disc = await expect
    .poll(() => document.querySelector(".sb-wheel__disc"))
    .not.toBeNull()
    .then(() => document.querySelector(".sb-wheel__disc")!);
  // The single name fills the disc; the pegs turn with it.
  expect(disc.querySelectorAll("[data-testid=wheel-wedge]")).toHaveLength(1);
  const pegs = [...disc.querySelectorAll("circle")].filter(
    (c) => c.getAttribute("r") === "3.5",
  );
  expect(pegs.length).toBeGreaterThanOrEqual(12);
});

test("neighbouring names never share a tone, the last and the first included", () => {
  for (const count of [2, 3, 6, 7, 12, 13]) {
    const tones = Array.from({ length: count }, (_, i) => toneIndex(i, count));
    for (let i = 0; i < count; i++)
      expect(tones[i]).not.toBe(tones[(i + 1) % count]);
  }
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

// sebaro's dialog that shows (§4.6): Escape and „Schließen“ close it — for
// this person; the spin goes on for the room.
test("Escape closes a running spin for oneself", async () => {
  seed(spinning());
  const spin = await render(overlay());
  await expect.element(spin.getByTestId("wheel-overlay")).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect
    .poll(() => spin.getByTestId("wheel-overlay").elements().length)
    .toBe(0);
  expect(useBoardStore.getState().state.lastSpin).not.toBeNull();
});

test("„Schließen“ is the dialog's last key and closes it", async () => {
  seed(spinning());
  const spin = await render(overlay());
  const close = spin.getByTestId("wheel-overlay-close");
  await expect.element(close).toBeVisible();
  const actions = close.element().parentElement!;
  expect(actions.lastElementChild).toBe(close.element());
  await close.click();
  await expect
    .poll(() => spin.getByTestId("wheel-overlay").elements().length)
    .toBe(0);
});

// A 36-character name was condensed into its wedge until it was a smear
// (owner, 2026-11-20). It now stands in two lines where the wedge allows.
test("a long name with a space stands in two lines, uncondensed", () => {
  const label = wheelLabel("Maximiliane-Sophie Oberbürgermeister", 3);
  expect(label.lines).toEqual(["Maximiliane-Sophie", "Oberbürgermeister"]);
  expect(label.condensed).toEqual([false, false]);
  expect(label.fontSize).toBeGreaterThanOrEqual(8.5);
});

test("a short name keeps one line, and a name that fits nowhere is condensed whole", () => {
  expect(wheelLabel("Anna", 3)).toMatchObject({
    lines: ["Anna"],
    condensed: [false],
  });
  // No space to split at: one line, condensed, but the whole name.
  const unbroken = "Maximilianesophieoberbuergermeisterin";
  expect(wheelLabel(unbroken, 3)).toMatchObject({
    lines: [unbroken],
    condensed: [true],
  });
  // Fifteen wedges are too narrow for two lines: one condensed line.
  expect(
    wheelLabel("Maximiliane-Sophie Oberbürgermeister", 15).lines,
  ).toHaveLength(1);
});
