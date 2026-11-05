// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import {
  IDLE_TIMER,
  type ClientCommand,
  type ServerEvent,
  type Timer,
} from "@retrobeam/shared";
import "../i18n.js";
import { ConnectionProvider } from "../lib/connection.js";
import { TimeLeft, TimerPanel } from "./TimerPanel.js";

function view(timer: Timer, isAdmin: boolean, sent: ClientCommand[] = []) {
  const connection = {
    boardId: "a".repeat(32),
    send: (command: ClientCommand) => sent.push(command),
    mutate: (
      command: ClientCommand,
      _optimistic: ServerEvent | ServerEvent[],
    ) => sent.push(command),
  };
  return (
    <ConnectionProvider value={connection}>
      <TimerPanel timer={timer} isAdmin={isAdmin} />
      <p data-testid="line">
        <TimeLeft timer={timer} form="line" />
      </p>
      <p data-testid="sentence">
        <TimeLeft timer={timer} form="sentence" />
      </p>
    </ConnectionProvider>
  );
}

// sebaro's time box (RB-1): the remaining time in words, whole minutes rounded
// up, no seconds; the facilitator's keys are secondary; members have none.
test("the time reads in whole minutes, and only the facilitator has keys", async () => {
  const timer = { ...IDLE_TIMER, endsAt: Date.now() + 150_000 };
  const member = await render(view(timer, false));
  await expect
    .element(member.getByTestId("line"))
    .toHaveTextContent(/^(noch 3\sMin\.|3\smin left)$/);
  await expect
    .element(member.getByTestId("sentence"))
    .toHaveTextContent(/^(Noch 3\sMin\.|3\smin left\.)$/);
  expect(member.getByTestId("timer-panel").elements()).toHaveLength(0);
  await member.unmount();

  const sent: ClientCommand[] = [];
  const facilitator = await render(view(timer, true, sent));
  await facilitator.getByRole("button", { name: /^\+1/ }).click();
  expect(sent).toEqual([{ type: "admin.timer.extend", addSec: 60 }]);
});

test("paused, up, and idle say so — idle says nothing", async () => {
  const paused = await render(
    view({ ...IDLE_TIMER, pausedRemainingMs: 61_000 }, false),
  );
  await expect
    .element(paused.getByTestId("sentence"))
    .toHaveTextContent(/2\s(Min\.|min left)/);
  await paused.unmount();

  const up = await render(
    view({ ...IDLE_TIMER, endsAt: Date.now() - 1000 }, false),
  );
  await expect
    .element(up.getByTestId("sentence"))
    .toHaveTextContent(/^(Zeit um\.|Time's up\.)$/);
  await up.unmount();

  const idle = await render(view(IDLE_TIMER, false));
  await expect.element(idle.getByTestId("sentence")).toHaveTextContent("");
});
