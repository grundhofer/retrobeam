// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import {
  PARTICIPANT_COLORS,
  type Note,
  type Participant,
} from "@retrobeam/shared";
import "../i18n.js";
import "../index.css";
import { ConnectionProvider } from "../lib/connection.js";
import { NoteCard } from "./NoteCard.js";
import { PersonAvatar, PersonRing } from "./PersonAvatar.js";

// A person's colour as a ring, the same tone everywhere (owner, 2026-11-20).
const anna: Participant = {
  id: "a".repeat(32),
  name: "Anna",
  // An old stored value: drawn as the new tone at its place.
  color: "#E8590C",
  role: "member",
  online: true,
};

const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

test("the avatar's ring and the small ring carry the person's tone", async () => {
  const screen = await render(
    <div>
      <PersonAvatar participant={anna} />
      <PersonRing participant={anna} />
    </div>,
  );
  const ring = screen.getByTestId("person-ring");
  await expect.element(ring).toBeInTheDocument();
  const avatar = ring.element().previousElementSibling as HTMLElement;
  const tone = rgb(PARTICIPANT_COLORS[0]);
  expect(getComputedStyle(avatar).borderTopColor).toBe(tone);
  expect(getComputedStyle(ring.element()).borderTopColor).toBe(tone);
  expect(getComputedStyle(ring.element()).borderTopWidth).toBe("2px");
});

const note: Note = {
  id: "c".repeat(32),
  columnId: "d".repeat(32),
  authorId: anna.id,
  text: "Deploys are slow",
  order: 1,
  gifUrl: null,
  x: null,
  y: null,
  groupId: null,
  reactions: {},
};

function card() {
  const you: Participant = { ...anna, id: "b".repeat(32), name: "Ben" };
  return (
    <ConnectionProvider
      value={{ boardId: "e".repeat(32), send: () => {}, mutate: () => {} }}
    >
      <NoteCard
        note={note}
        roster={[anna, you]}
        you={you}
        phase="present"
        isAdmin={false}
        revealIndex={0}
        presenterId={null}
        gifsEnabled={false}
        onDropNote={() => {}}
        onUngroup={() => {}}
      />
    </ConnectionProvider>
  );
}

test("a card carries its author's ring beside the name", async () => {
  const screen = await render(card());
  const ring = screen.getByTestId("note-card").getByTestId("person-ring");
  await expect.element(ring).toBeVisible();
  expect(getComputedStyle(ring.element()).borderTopColor).toBe(
    rgb(PARTICIPANT_COLORS[0]),
  );
});
