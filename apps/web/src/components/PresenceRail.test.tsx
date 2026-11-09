// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { Participant, PickerState } from "@retrobeam/shared";
import i18n from "../i18n.js";
import { ConnectionProvider } from "../lib/connection.js";
import { PickerControls, PresenceRail, PresentStatus } from "./PresenceRail.js";

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
  remaining: [anna.id],
  presented: [],
  current: null,
  excluded: [],
  revealed: [],
  revealedAll: false,
};

test("the initial action follows the selected slots tool", async () => {
  const screen = await render(
    <ConnectionProvider
      value={{ boardId: "b".repeat(32), send: vi.fn(), mutate: vi.fn() }}
    >
      <PickerControls picker={picker} roster={[anna]} pickerStyle="slots" />
    </ConnectionProvider>,
  );

  // sebaro: the slots icon from the set and the word, no emoji (F7).
  const spin = screen.getByTestId("spin-button");
  await expect.element(spin).toHaveTextContent(i18n.t("picker.startSlots"));
  expect(spin.element().querySelector("use")?.getAttribute("href")).toBe(
    "#slots",
  );
});

test("an anonymous board calls nobody up, and says why the wheel is missing", async () => {
  const screen = await render(
    <ConnectionProvider
      value={{ boardId: "b".repeat(32), send: vi.fn(), mutate: vi.fn() }}
    >
      <PresenceRail
        phase="present"
        roster={[anna, ben]}
        you={anna}
        isAdmin
        anonymous
      />
    </ConnectionProvider>,
  );

  await expect
    .element(screen.getByTestId("present-anonymous-hint"))
    .toHaveTextContent(i18n.t("present.anonymous"));
  expect(document.querySelector("[data-testid='spin-button']")).toBeNull();
  expect(document.querySelector("[data-testid='picker-style']")).toBeNull();
  expect(document.querySelector(`[data-testid='pick-${ben.name}']`)).toBeNull();
});

test("cards open the full-screen selection instead of rendering in the group", async () => {
  const send = vi.fn();
  const openCards = vi.fn();
  const screen = await render(
    <ConnectionProvider
      value={{ boardId: "b".repeat(32), send, mutate: vi.fn() }}
    >
      <PickerControls
        picker={{ ...picker, remaining: [anna.id, ben.id] }}
        roster={[anna, ben]}
        pickerStyle="cards"
        onOpenCards={openCards}
      />
    </ConnectionProvider>,
  );

  expect(document.querySelector("[data-testid='picker-card']")).toBeNull();
  expect(document.querySelector("[data-testid='spin-button']")).toBeNull();
  await screen.getByTestId("open-card-picker").click();
  expect(openCards).toHaveBeenCalledOnce();
  expect(send).not.toHaveBeenCalled();
});

// The presenting round above the board (owner, 2026-11-08, „Vorstellrunde“):
// who is on, who is still open by name — for the facilitator the open names
// are the keys that pick.
test("the presenting round names who is on and who is still open", async () => {
  const send = vi.fn();
  const round: PickerState = {
    ...picker,
    remaining: [anna.id],
    current: ben.id,
  };
  const admin = await render(
    <ConnectionProvider
      value={{ boardId: "b".repeat(32), send, mutate: vi.fn() }}
    >
      <PresentStatus roster={[anna, ben]} picker={round} you={anna} isAdmin />
    </ConnectionProvider>,
  );
  await expect
    .element(admin.getByTestId("presenter-banner"))
    .toHaveTextContent(/Ben/);
  await admin.getByTestId("pick-Anna").click();
  expect(send).toHaveBeenCalledWith({
    type: "admin.picker.pick",
    participantId: anna.id,
  });
  await admin.unmount();

  const member = await render(
    <ConnectionProvider
      value={{ boardId: "b".repeat(32), send: vi.fn(), mutate: vi.fn() }}
    >
      <PresentStatus
        roster={[anna, ben]}
        picker={round}
        you={ben}
        isAdmin={false}
      />
    </ConnectionProvider>,
  );
  await expect
    .element(member.getByTestId("present-open"))
    .toHaveTextContent(/Anna/);
  expect(member.getByTestId("pick-Anna").elements()).toHaveLength(0);
});

// Skip beside the person on stage; put back one person, or the whole round
// (owner, 2026-11-09).
test("the facilitator skips the presenter and puts people back", async () => {
  const send = vi.fn();
  const round: PickerState = {
    ...picker,
    remaining: [],
    presented: [anna.id],
    current: ben.id,
  };
  const screen = await render(
    <ConnectionProvider
      value={{ boardId: "b".repeat(32), send, mutate: vi.fn() }}
    >
      <PresentStatus roster={[anna, ben]} picker={round} you={anna} isAdmin />
    </ConnectionProvider>,
  );
  await screen.getByTestId("picker-skip").click();
  expect(send).toHaveBeenLastCalledWith({ type: "admin.picker.skip" });
  await screen.getByTestId("present-all").click();
  await screen.getByTestId("picker-reset-Anna").click();
  expect(send).toHaveBeenLastCalledWith({
    type: "admin.picker.reset",
    participantId: anna.id,
  });
  await screen.getByTestId("picker-reset-round").click();
  expect(send).toHaveBeenLastCalledWith({ type: "admin.picker.reset" });
});
