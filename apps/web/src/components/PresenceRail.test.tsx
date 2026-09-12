// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { Participant, PickerState } from "@retrobeam/shared";
import i18n from "../i18n.js";
import { ConnectionProvider } from "../lib/connection.js";
import { PresenceRail } from "./PresenceRail.js";

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
      <PresenceRail
        phase="present"
        roster={[anna]}
        readyIds={[]}
        picker={picker}
        you={anna}
        isAdmin
        pickerStyle="slots"
      />
    </ConnectionProvider>,
  );

  await expect
    .element(screen.getByTestId("spin-button"))
    .toHaveTextContent(`🎰 ${i18n.t("picker.startSlots")}`);
});

test("cards replace the start button with one face-down choice per person", async () => {
  const send = vi.fn();
  const screen = await render(
    <ConnectionProvider
      value={{ boardId: "b".repeat(32), send, mutate: vi.fn() }}
    >
      <PresenceRail
        phase="present"
        roster={[anna, ben]}
        readyIds={[]}
        picker={{ ...picker, remaining: [anna.id, ben.id] }}
        you={anna}
        isAdmin
        pickerStyle="cards"
      />
    </ConnectionProvider>,
  );

  expect(screen.getByTestId("picker-card").elements()).toHaveLength(2);
  expect(document.querySelector("[data-testid='spin-button']")).toBeNull();
  await screen.getByTestId("picker-card").first().click();
  expect(send).toHaveBeenCalledWith({ type: "admin.picker.spin" });
});
