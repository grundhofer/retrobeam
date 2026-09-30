// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import type { ClientCommand, Participant } from "@retrobeam/shared";
import "../i18n.js";
import { ConnectionProvider } from "../lib/connection.js";
import { AvatarRow } from "./AvatarRow.js";
import { Roster } from "./Roster.js";

const anna: Participant = {
  id: "p1",
  name: "Anna",
  color: "#E8590C",
  role: "facilitator",
  online: true,
};
const ben: Participant = {
  id: "p2",
  name: "Ben",
  color: "#1971C2",
  role: "member",
  online: false,
};

test("renders all participants with facilitator badge and offline state", async () => {
  const screen = await render(
    <Roster participants={[anna, ben]} youId={ben.id} />,
  );

  await expect.element(screen.getByText("Anna")).toBeInTheDocument();
  await expect.element(screen.getByText(/Ben/)).toBeInTheDocument();
  await expect
    .element(screen.getByText(/Facilitator|Moderation/))
    .toBeInTheDocument();

  const items = screen.getByTestId("roster-item").elements();
  expect(items).toHaveLength(2);
  const benItem = items[1] as HTMLElement;
  expect(benItem.className).toContain("opacity-45");
});

test("marks the current user with a (you) suffix", async () => {
  const screen = await render(<Roster participants={[anna]} youId={anna.id} />);
  await expect.element(screen.getByText(/\((you|du)\)/)).toBeInTheDocument();
});

function withConnection(sent: ClientCommand[], node: React.ReactNode) {
  const connection = {
    boardId: "b".repeat(32),
    send: (command: ClientCommand) => {
      sent.push(command);
    },
    mutate: () => {},
  };
  return <ConnectionProvider value={connection}>{node}</ConnectionProvider>;
}

// Co-facilitation used to hide behind a 28px avatar in the header. In the
// lobby, where a facilitator sets the room up, it is a visible row action.
test("a facilitator can make someone a co-facilitator from the roster row", async () => {
  const sent: ClientCommand[] = [];
  const screen = await render(
    withConnection(
      sent,
      <Roster participants={[anna, ben]} youId={anna.id} isAdmin />,
    ),
  );
  await screen.getByTestId("roster-role-Ben").click();
  expect(sent).toEqual([
    { type: "admin.role.set", participantId: ben.id, role: "facilitator" },
  ]);
  // The only facilitator's own row offers nothing that could only be refused.
  expect(screen.getByTestId("roster-role-Anna").elements()).toHaveLength(0);
});

test("members see no role switch in the roster", async () => {
  const screen = await render(
    withConnection([], <Roster participants={[anna, ben]} youId={ben.id} />),
  );
  await expect.element(screen.getByText("Anna")).toBeInTheDocument();
  expect(screen.getByTestId("roster-role-Ben").elements()).toHaveLength(0);
});

test("demoting the last facilitator is disabled, with the reason as text", async () => {
  const sent: ClientCommand[] = [];
  const screen = await render(
    withConnection(
      sent,
      <AvatarRow participants={[anna, ben]} youId={anna.id} isAdmin />,
    ),
  );
  await screen.getByTestId("avatar-Anna").click();
  const toggle = screen.getByTestId("role-toggle-Anna");
  await expect.element(toggle).toBeDisabled();
  await expect
    .element(screen.getByTestId("role-toggle-Anna-reason"))
    .toHaveTextContent(/At least one person|Mindestens eine Person/);
  expect(sent).toEqual([]);
});

test("with two facilitators, either can be demoted", async () => {
  const sent: ClientCommand[] = [];
  const cara: Participant = {
    ...ben,
    id: "p3",
    name: "Cara",
    role: "facilitator",
    online: true,
  };
  const screen = await render(
    withConnection(
      sent,
      <Roster participants={[anna, cara]} youId={anna.id} isAdmin />,
    ),
  );
  await screen.getByTestId("roster-role-Cara").click();
  expect(sent).toEqual([
    { type: "admin.role.set", participantId: cara.id, role: "member" },
  ]);
});
