// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import type { ClientCommand, ServerEvent } from "@retrobeam/shared";
import i18n from "../i18n.js";
import "../index.css";
import { ConnectionProvider } from "../lib/connection.js";
import { useBoardStore } from "../store/boardStore.js";
import { CheckinPanel } from "./CheckinPanel.js";
import { RotiPoll } from "./RotiPoll.js";

// The phase views in sebaro (plan stage 5d): the check-in's Prime Directive as
// a quote with its source, and ROTI as a segmented choice with a rating that
// shows only the average, only once it is published (§6.1 g).

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

test("the Prime Directive is a quote with its source, and can be put away", async () => {
  const screen = await render(
    <CheckinPanel icebreakerId={null} workingAgreements="" />,
  );
  const quote = screen.container.querySelector("figure.sb-quote");
  expect(quote?.querySelector("blockquote")?.textContent).toBe(
    i18n.t("checkin.primeDirective"),
  );
  expect(quote?.querySelector("figcaption")?.textContent).toContain("Kerth");
  await screen
    .getByRole("button", { name: i18n.t("checkin.hideDirective") })
    .click();
  expect(screen.container.querySelector("figure.sb-quote")).toBeNull();
});

test("ROTI is a choice of 1 to 5; the rating shows only a published average", async () => {
  const sent: ClientCommand[] = [];
  useBoardStore.setState((store) => ({
    state: {
      ...store.state,
      roti: { count: 2, average: null, yourScore: 4, released: false },
    },
  }));
  const open = await render(connected(sent, <RotiPoll />));
  expect(open.getByRole("radio").elements()).toHaveLength(5);
  await expect.element(open.getByTestId("roti-4")).toBeChecked();
  await open.getByTestId("roti-2").click();
  expect(sent).toEqual([{ type: "roti.set", score: 2 }]);
  expect(open.getByTestId("roti-result").elements()).toHaveLength(0);
  await expect.element(open.getByTestId("roti-pending")).toBeVisible();
  await open.unmount();

  useBoardStore.setState((store) => ({
    state: {
      ...store.state,
      roti: { count: 3, average: 4.2, yourScore: 4, released: true },
    },
  }));
  const done = await render(connected([], <RotiPoll readOnly />));
  expect(done.getByRole("radio").elements()).toHaveLength(0);
  const result = done.getByTestId("roti-result");
  await expect.element(result).toHaveClass("sb-rating");
  await expect.element(result).toHaveTextContent(/4[.,]2 \S+ 5/);
  await expect.element(result).toHaveTextContent(/3\s\S+/);
});
