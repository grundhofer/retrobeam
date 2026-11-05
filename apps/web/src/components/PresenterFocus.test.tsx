// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type {
  ClientCommand,
  Column,
  Note,
  Participant,
} from "@retrobeam/shared";
import "../i18n.js";
import { ConnectionProvider } from "../lib/connection.js";
import { PresenterFocus } from "./PresenterFocus.js";

// sebaro (plan stage 5h): the card on stage carries the place edge
// (aria-current); stepping to it scrolls without smoothing where motion is to
// be left out — sebaro's data-sb-motion as well as the system's setting; the
// facilitator's step is a secondary key (the phase step stays the one primary
// action).

const anna: Participant = {
  id: "a".repeat(32),
  name: "Anna",
  color: "#E8590C",
  role: "facilitator",
  online: true,
};
const column: Column = {
  id: "c".repeat(32),
  name: "Went well",
  order: 1,
  hidden: false,
  rect: null,
};
function note(id: string, order: number, text: string): Note {
  return {
    id,
    columnId: column.id,
    authorId: anna.id,
    text,
    order,
    gifUrl: null,
    x: null,
    y: null,
    groupId: null,
    reactions: {},
  };
}
const first = note("1".repeat(32), 1, "Deploys are slow");
const second = note("2".repeat(32), 2, "Pairing helped");

afterEach(() => {
  delete document.documentElement.dataset.sbMotion;
  vi.restoreAllMocks();
});

function focus(sent: ClientCommand[] = []) {
  return (
    <ConnectionProvider
      value={{
        boardId: "b".repeat(32),
        send: (command: ClientCommand) => sent.push(command),
        mutate: vi.fn(),
      }}
    >
      <PresenterFocus
        notes={[first, second]}
        columns={[column]}
        roster={[anna]}
        you={anna}
        phase="present"
        isAdmin
        presenter={anna}
        spotlightId={first.id}
        focusMode
        picker={null}
        pickerStyle="wheel"
      />
    </ConnectionProvider>
  );
}

test("the card on stage carries the place mark, and the step is a secondary key", async () => {
  const sent: ClientCommand[] = [];
  const screen = await render(focus(sent));
  const stage = screen.getByTestId("present-stage");
  await expect.element(stage).toHaveTextContent("Deploys are slow");
  await expect
    .element(stage.getByTestId("note-card"))
    .toHaveAttribute("aria-current", "true");

  const next = screen.getByTestId("present-next");
  await expect.element(next).toHaveClass("sb-secondary-action");
  await next.click();
  expect(sent).toEqual([{ type: "admin.spotlight.set", targetId: second.id }]);
});

test("data-sb-motion=reduce scrolls to the stage without smoothing", async () => {
  document.documentElement.dataset.sbMotion = "reduce";
  const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
  const screen = await render(focus());
  await expect.element(screen.getByTestId("present-stage")).toBeVisible();
  expect(scroll).toHaveBeenCalledWith(
    expect.objectContaining({ behavior: "auto" }),
  );
});
