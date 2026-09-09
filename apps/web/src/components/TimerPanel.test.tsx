// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import {
  IDLE_TIMER,
  type ClientCommand,
  type ServerEvent,
} from "@retrobeam/shared";
import "../i18n.js";
import { ConnectionProvider } from "../lib/connection.js";
import { TimerPanel } from "./TimerPanel.js";

const KEY = "retrobeam.sound";

afterEach(() => localStorage.removeItem(KEY));

function view() {
  const connection = {
    boardId: "a".repeat(32),
    send: (_command: ClientCommand) => {},
    mutate: (
      _command: ClientCommand,
      _optimistic: ServerEvent | ServerEvent[],
    ) => {},
  };
  return (
    <ConnectionProvider value={connection}>
      <TimerPanel timer={IDLE_TIMER} isAdmin={false} />
    </ConnectionProvider>
  );
}

// The default has to be observable to a MEMBER, not just the facilitator: the
// person most likely to miss the timer is the one with no controls.
test("the bell starts on, mutes on click, and the mute survives a remount", async () => {
  localStorage.removeItem(KEY);
  const first = await render(view());
  const bell = first.getByTestId("timer-sound");
  await expect.element(bell).toHaveAttribute("aria-pressed", "true");

  await bell.click();
  await expect.element(bell).toHaveAttribute("aria-pressed", "false");
  expect(localStorage.getItem(KEY)).toBe("0");

  // TimerPanel remounts on every layout/phase switch; the lazy useState
  // initializer is what makes the stored mute survive that.
  await first.unmount();
  const second = await render(view());
  await expect
    .element(second.getByTestId("timer-sound"))
    .toHaveAttribute("aria-pressed", "false");
});
