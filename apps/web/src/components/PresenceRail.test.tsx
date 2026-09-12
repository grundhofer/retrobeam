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
