// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import {
  DEFAULT_PHASE_PLAN,
  type BoardConfig,
  type ClientCommand,
  type Participant,
  type ServerEvent,
} from "@retrobeam/shared";
import i18n from "../i18n.js";
import "../index.css";
import { ConnectionProvider } from "../lib/connection.js";
import { useBoardStore } from "../store/boardStore.js";
import { FocusToggle } from "./FocusToggle.js";
import { ReadyBar } from "./ReadyBar.js";
import { VoteBar } from "./VoteBar.js";

// The phase strip's parts in sebaro (plan stage 5c): the ready key, the vote's
// sentence and set-up, and the focus switch. Checked by role, state and the
// words' numbers, not by the UI language.

const config: BoardConfig = {
  anonymous: false,
  phasePlan: DEFAULT_PHASE_PLAN,
  votesPerPerson: 3,
  maxPerTarget: null,
  topN: 3,
  gifsEnabled: true,
  pickerStyle: "wheel",
  layout: "columns",
  cursorsEnabled: false,
  voterNamesEnabled: false,
  focusMode: false,
};

function connected(sent: ClientCommand[], node: React.ReactNode) {
  const connection = {
    boardId: "a".repeat(32),
    send: (command: ClientCommand) => sent.push(command),
    mutate: (
      command: ClientCommand,
      _optimistic: ServerEvent | ServerEvent[],
    ) => sent.push(command),
  };
  return <ConnectionProvider value={connection}>{node}</ConnectionProvider>;
}

afterEach(() => useBoardStore.getState().reset());

const person = (id: string, online = true): Participant => ({
  id,
  name: id,
  color: "#000000",
  role: "member",
  online,
});

test("ready: one key with a fixed label, its state pressed, the count in words", async () => {
  const sent: ClientCommand[] = [];
  const roster = [person("a"), person("b"), person("c", false)];
  const screen = await render(
    connected(sent, <ReadyBar readyIds={["a"]} roster={roster} youId="a" />),
  );
  const key = screen.getByTestId("ready-toggle");
  await expect.element(key).toHaveAttribute("aria-pressed", "true");
  await expect.element(key).toHaveAccessibleName(i18n.t("ready.imDone"));
  // Online people only: 1 of 2.
  await expect
    .element(screen.getByTestId("ready-count"))
    .toHaveTextContent(/1 \S+ 2/);
  await key.click();
  expect(sent).toEqual([{ type: "ready.set", ready: false }]);
});

test("votes: what is left is a sentence, the privacy line stands for everyone", async () => {
  useBoardStore.setState((store) => ({
    state: {
      ...store.state,
      votes: { ...store.state.votes, mine: { x: 1 } },
    },
  }));
  const member = await render(
    connected([], <VoteBar config={config} isAdmin={false} />),
  );
  await expect
    .element(member.getByTestId("votes-remaining"))
    .toHaveTextContent(/2\D+3/);
  await expect.element(member.getByTestId("vote-privacy")).toBeVisible();
  expect(member.getByTestId("vote-settings").elements()).toHaveLength(0);
  await member.unmount();

  useBoardStore.setState((store) => ({
    state: {
      ...store.state,
      votes: { ...store.state.votes, mine: { x: 2, y: 1 } },
    },
  }));
  const spent = await render(
    connected([], <VoteBar config={config} isAdmin={false} />),
  );
  await expect
    .element(spent.getByTestId("votes-remaining"))
    .toHaveTextContent(
      i18n.t("vote.allGiven", { total: 3 }).replace(/\u00a0/g, " "),
    );
});

test("votes: the facilitator sets the vote up in a dialog, empty means no cap", async () => {
  const sent: ClientCommand[] = [];
  const screen = await render(
    connected(sent, <VoteBar config={config} isAdmin />),
  );
  await screen.getByTestId("vote-settings").click();
  const max = screen.getByLabelText(new RegExp(i18n.t("vote.maxPerTarget")));
  await expect.element(max).toHaveValue(null);
  await userEvent.fill(max, "12");
  await screen.getByTestId("vote-settings-apply").click();
  expect(sent).toEqual([
    {
      type: "admin.vote.config",
      votesPerPerson: 3,
      maxPerTarget: 10,
      topN: 3,
    },
  ]);
  await expect.element(screen.getByTestId("vote-settings")).toHaveFocus();
});

test("focus: a switch for the facilitator, a tag for everyone else", async () => {
  const sent: ClientCommand[] = [];
  const admin = await render(
    connected(sent, <FocusToggle focusMode={false} isAdmin />),
  );
  const toggle = admin.getByTestId("focus-mode-toggle");
  await expect.element(toggle).toHaveAttribute("role", "switch");
  await expect.element(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  expect(sent).toEqual([{ type: "admin.focus.set", enabled: true }]);
  await admin.unmount();

  const member = await render(
    connected([], <FocusToggle focusMode isAdmin={false} />),
  );
  await expect.element(member.getByTestId("focus-mode-state")).toBeVisible();
  expect(member.getByRole("switch").elements()).toHaveLength(0);
});
