// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import type { Note, Participant } from "@retrobeam/shared";
import "../i18n.js";
import "../index.css";
import { ConnectionProvider } from "../lib/connection.js";
import { NoteCard } from "./NoteCard.js";
import { PersonAvatar, PersonName } from "./PersonAvatar.js";

// A person's tone as a ring, the same everywhere (owner, 2026-11-20; sebaro
// FAR-16): sebaro's --sb-person-<tone>, never a colour of our own.
const anna: Participant = {
  id: "a".repeat(32),
  name: "Anna",
  tone: 3,
  role: "member",
  online: true,
};

// The colour sebaro gives a tone, resolved the way the browser draws it.
function toneColour(tone: number): string {
  const probe = document.createElement("span");
  probe.style.color = `var(--sb-person-${tone})`;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

test("the avatar's ring and the small ring carry the person's tone", async () => {
  const screen = await render(
    <div>
      <PersonAvatar participant={anna} />
      <PersonName participant={anna}>Anna</PersonName>
    </div>,
  );
  const name = screen.getByTestId("person-name");
  await expect.element(name).toBeInTheDocument();
  const avatar = name.element().previousElementSibling as HTMLElement;
  const tone = toneColour(3);
  expect(tone).not.toBe(toneColour(1));
  expect(getComputedStyle(avatar).borderTopColor).toBe(tone);
  expect(getComputedStyle(avatar).borderTopWidth).toBe("2px");
  const ring = getComputedStyle(name.element(), "::before");
  expect(ring.borderTopColor).toBe(tone);
  expect(ring.borderTopWidth).toBe("2px");
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
  const name = screen.getByTestId("note-card").getByTestId("person-name");
  await expect.element(name).toBeVisible();
  expect(getComputedStyle(name.element(), "::before").borderTopColor).toBe(
    toneColour(3),
  );
});
