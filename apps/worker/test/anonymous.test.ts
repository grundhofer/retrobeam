// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Note, ServerEvent } from "@retrobeam/shared";
import { connect, createBoard, ipHeaders, type TestSocket } from "./helpers.js";

// Anonymous boards: nobody but the author learns who wrote a card — the
// facilitator included. Every assertion here is about what reaches the WIRE,
// because that is where the promise is kept; a client that merely hides names
// would still be handing them to anyone who opens the dev tools.
//
// Own test file: pool-workers isolates storage per file.

let opCounter = 0x70000;
function opId(): string {
  return (opCounter++).toString(16).padStart(32, "0");
}
function newId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

type SyncEvent = Extract<ServerEvent, { type: "sync" }>;

async function joined(
  boardId: string,
  name: string,
  adminToken?: string,
): Promise<{ socket: TestSocket; you: SyncEvent["you"]; sync: SyncEvent }> {
  const socket = await connect(boardId);
  socket.send({
    type: "join",
    name,
    ...(adminToken === undefined ? {} : { adminToken }),
  });
  const sync = await socket.waitFor((e) => e.type === "sync");
  if (sync.type !== "sync") throw new Error("unreachable");
  return { socket, you: sync.you, sync };
}

type Person = Awaited<ReturnType<typeof joined>>;

async function toPhase(socket: TestSocket, phase: string): Promise<void> {
  socket.send({ type: "admin.phase.set", phase });
  await socket.waitForNext(
    (e) => e.type === "phase.changed" && e.phase === phase,
  );
}

async function write(person: Person, columnId: string, text: string) {
  const noteId = newId();
  person.socket.send({
    type: "note.create",
    opId: opId(),
    noteId,
    columnId,
    text,
  });
  await person.socket.waitFor(
    (e) => e.type === "note.created" && e.note.id === noteId,
  );
  return noteId;
}

async function resync(person: Person): Promise<SyncEvent> {
  person.socket.send({ type: "resync" });
  const sync = await person.socket.waitForNext((e) => e.type === "sync");
  if (sync.type !== "sync") throw new Error("unreachable");
  return sync;
}

/** Every note copy a participant was ever handed, from any event. */
function notesIn(events: readonly ServerEvent[]): Note[] {
  return events.flatMap((e) =>
    e.type === "sync" || e.type === "notes.revealed"
      ? e.notes
      : e.type === "note.created" || e.type === "note.updated"
        ? [e.note]
        : [],
  );
}

/** The anonymity invariant, for one recipient: a note either names the
 *  recipient as its author or names nobody — and a note that names nobody
 *  carries no per-author order either. */
function expectNoForeignAuthorship(person: Person): void {
  const notes = notesIn(person.socket.events);
  expect(notes.length).toBeGreaterThan(0); // not vacuous
  for (const note of notes) {
    expect([null, person.you.id]).toContain(note.authorId);
    if (note.authorId === null) expect(note.order).toBe(0);
  }
}

/** Zelda (facilitator) + Yorick + Xavier on an anonymous board, sitting in
 *  "write" with one column id in hand. Distinctive names so a text search of
 *  an export cannot match anything by accident. */
async function anonymousRoom() {
  const { boardId, adminToken } = await createBoard("Quiet board", {
    anonymous: true,
  });
  const zelda = await joined(boardId, "Zelda", adminToken);
  const yorick = await joined(boardId, "Yorick");
  const xavier = await joined(boardId, "Xavier");
  const columnId = zelda.sync.columns[0]?.id;
  const otherColumn = zelda.sync.columns[1]?.id;
  if (!columnId || !otherColumn) throw new Error("setup");
  await toPhase(zelda.socket, "write");
  return { boardId, adminToken, zelda, yorick, xavier, columnId, otherColumn };
}

describe("creating an anonymous board", () => {
  it("is opt-in at creation, and seeds the settings that would undo it off", async () => {
    const plain = await createBoard("Plain");
    const plainAdmin = await joined(plain.boardId, "Zelda", plain.adminToken);
    expect(plainAdmin.sync.config.anonymous).toBe(false);
    // The product default for voter names still applies to a normal board.
    expect(plainAdmin.sync.config.voterNamesEnabled).toBe(true);

    const quiet = await createBoard("Quiet", { anonymous: true });
    const quietAdmin = await joined(quiet.boardId, "Zelda", quiet.adminToken);
    expect(quietAdmin.sync.config.anonymous).toBe(true);
    // Not merely ignored by voterNamesShown — stored off, so no screen and no
    // menu ever claims names will be shown.
    expect(quietAdmin.sync.config.voterNamesEnabled).toBe(false);
    expect(quietAdmin.sync.config.cursorsEnabled).toBe(false);
  });

  it("refuses a non-boolean flag rather than guessing", async () => {
    const response = await SELF.fetch("https://example.com/api/boards", {
      method: "POST",
      headers: { "content-type": "application/json", ...ipHeaders() },
      body: JSON.stringify({ name: "Quiet", anonymous: "yes" }),
    });
    expect(response.status).toBe(400);
  });

  it("carries over to a duplicate — the copy keeps the promise", async () => {
    for (const anonymous of [true, false]) {
      const source = await createBoard("Source", { anonymous });
      const response = await SELF.fetch(
        `https://example.com/api/boards/${source.boardId}/duplicate`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...ipHeaders() },
          body: JSON.stringify({ adminToken: source.adminToken }),
        },
      );
      expect(response.status).toBe(200);
      const copy = (await response.json()) as {
        boardId: string;
        adminToken: string;
      };
      const admin = await joined(copy.boardId, "Zelda", copy.adminToken);
      expect(admin.sync.config.anonymous).toBe(anonymous);
      if (anonymous) expect(admin.sync.config.voterNamesEnabled).toBe(false);
    }
  });
});

describe("authorship on the wire", () => {
  it("never hands a member or the facilitator another participant's authorship", async () => {
    const { zelda, yorick, xavier, columnId, otherColumn } =
      await anonymousRoom();
    const zeldaCard = await write(zelda, columnId, "zelda's card");
    // Two cards in one column: their per-author order (1, 2) is exactly what
    // must not survive onto anyone else's screen.
    const yorickFirst = await write(yorick, columnId, "yorick's first");
    await write(yorick, columnId, "yorick's second");
    const xavierCard = await write(xavier, columnId, "xavier's card");

    // The reveal burst and the snapshot, for the facilitator and a member.
    await toPhase(zelda.socket, "present");
    await yorick.socket.waitFor((e) => e.type === "notes.revealed");
    expect((await resync(zelda)).notes).toHaveLength(4);
    expect((await resync(yorick)).notes).toHaveLength(4);

    // Live events of every note-bearing kind while the board is open: a card
    // created mid-round, a reaction, a stack, and a move between columns.
    const lateCard = await write(xavier, columnId, "xavier's late card");
    zelda.socket.send({
      type: "note.react",
      opId: opId(),
      noteId: yorickFirst,
      emoji: "👍",
      on: true,
    });
    await yorick.socket.waitFor(
      (e) =>
        e.type === "note.updated" &&
        e.note.id === yorickFirst &&
        Object.keys(e.note.reactions).length > 0,
    );
    yorick.socket.send({
      type: "note.group",
      opId: opId(),
      noteId: xavierCard,
      targetNoteId: zeldaCard,
    });
    await zelda.socket.waitFor(
      (e) =>
        e.type === "note.updated" &&
        e.note.id === xavierCard &&
        e.note.groupId === zeldaCard,
    );
    xavier.socket.send({
      type: "note.move",
      opId: opId(),
      noteId: lateCard,
      columnId: otherColumn,
    });
    await zelda.socket.waitFor(
      (e) =>
        e.type === "note.updated" &&
        e.note.id === lateCard &&
        e.note.columnId === otherColumn,
    );

    // …and through the later phases, snapshot included.
    await toPhase(zelda.socket, "vote");
    await toPhase(zelda.socket, "discuss");
    await resync(zelda);
    await resync(yorick);
    await resync(xavier);

    for (const person of [zelda, yorick, xavier]) {
      expectNoForeignAuthorship(person);
    }
    // The author still recognises their own card — it is how they edit it.
    const ownCopy = (await resync(yorick)).notes.find(
      (n) => n.id === yorickFirst,
    );
    expect(ownCopy?.authorId).toBe(yorick.you.id);
    expect(ownCopy?.order).toBe(1);
  });

  it("sends the snapshot's notes in id order, not in per-author order", async () => {
    const { zelda, yorick, columnId } = await anonymousRoom();
    // Every author's FIRST card, then Yorick's second: ORDER BY ord would list
    // them 1, 1, 2 — which is the linkage the order field already stopped
    // carrying, rebuilt from the array.
    await write(zelda, columnId, "one");
    await write(yorick, columnId, "two");
    await write(yorick, columnId, "three");
    await toPhase(zelda.socket, "present");
    const ids = (await resync(zelda)).notes.map((n) => n.id);
    expect(ids).toEqual([...ids].sort());
  });

  it("circulates no editing ghost — to members or to the facilitator", async () => {
    // Control first, on a normal board: the same barrier DOES catch a ghost,
    // so the negative assertion below cannot pass by timing alone.
    const plain = await createBoard("Plain");
    const plainAdmin = await joined(plain.boardId, "Zelda", plain.adminToken);
    const plainMember = await joined(plain.boardId, "Yorick");
    const plainColumn = plainAdmin.sync.columns[0]?.id ?? "";
    await toPhase(plainAdmin.socket, "write");
    plainMember.socket.send({
      type: "presence.editing",
      columnId: plainColumn,
    });
    plainMember.socket.send({ type: "ready.set", ready: true });
    await plainAdmin.socket.waitFor((e) => e.type === "ready.changed");
    expect(
      plainAdmin.socket.events.some((e) => e.type === "presence.editing"),
    ).toBe(true);

    const { zelda, yorick, xavier, columnId } = await anonymousRoom();
    yorick.socket.send({ type: "presence.editing", columnId });
    yorick.socket.send({ type: "ready.set", ready: true });
    await zelda.socket.waitFor((e) => e.type === "ready.changed");
    await xavier.socket.waitFor((e) => e.type === "ready.changed");
    // A tab closing mid-edit sends the clear — which on this board would be
    // the only editing frame anyone ever got, so it is not sent either.
    yorick.socket.ws.close();
    await zelda.socket.waitFor((e) => e.type === "presence.leave");
    await xavier.socket.waitFor((e) => e.type === "presence.leave");
    for (const person of [zelda, xavier]) {
      expect(
        person.socket.events.some((e) => e.type === "presence.editing"),
      ).toBe(false);
    }
  });
});

describe("the presenting phase on an anonymous board", () => {
  it("calls nobody up — the wheel and the hand-pick are refused", async () => {
    const { zelda, yorick, columnId } = await anonymousRoom();
    await write(yorick, columnId, "yorick's card");
    await toPhase(zelda.socket, "present");

    zelda.socket.send({ type: "admin.picker.spin" });
    const spun = await zelda.socket.waitForNext((e) => e.type === "reject");
    if (spun.type !== "reject") throw new Error("unreachable");
    expect(spun.code).toBe("INVALID");

    zelda.socket.send({
      type: "admin.picker.pick",
      participantId: yorick.you.id,
    });
    const picked = await zelda.socket.waitForNext((e) => e.type === "reject");
    if (picked.type !== "reject") throw new Error("unreachable");
    expect(picked.code).toBe("INVALID");

    expect((await resync(yorick)).picker?.current ?? null).toBeNull();
    expect(yorick.socket.events.some((e) => e.type === "picker.spun")).toBe(
      false,
    );
    // Nothing is paced either: the member already holds the whole board.
    expect((await resync(yorick)).notes).toHaveLength(1);
  });

  it("refuses live cursors, which would show who placed a card", async () => {
    const { zelda } = await anonymousRoom();
    zelda.socket.send({ type: "admin.cursors.set", enabled: true });
    const refused = await zelda.socket.waitForNext((e) => e.type === "reject");
    if (refused.type !== "reject") throw new Error("unreachable");
    expect(refused.code).toBe("INVALID");
    expect((await resync(zelda)).config.cursorsEnabled).toBe(false);
  });
});

describe("export", () => {
  it("names no author and no voter in any format, even when names are asked for", async () => {
    const { boardId, zelda, yorick, xavier, columnId } = await anonymousRoom();
    const zeldaCard = await write(zelda, columnId, "zelda's exported card");
    await write(yorick, columnId, "yorick's exported card");
    await write(xavier, columnId, "xavier's exported card");
    await toPhase(zelda.socket, "present");
    await toPhase(zelda.socket, "vote");
    // A vote, so the voter-name path has something it could leak.
    yorick.socket.send({
      type: "vote.cast",
      opId: opId(),
      targetId: zeldaCard,
      count: 1,
    });
    await yorick.socket.waitFor((e) => e.type === "vote.progress");
    await toPhase(zelda.socket, "discuss");

    for (const format of ["md", "csv", "json", "pdf"]) {
      const response = await SELF.fetch(
        `https://example.com/api/boards/${boardId}/export?format=${format}&authors=true`,
      );
      expect(response.status).toBe(200);
      // The PDF is written uncompressed in WinAnsi, so its text is searchable
      // once decoded byte-for-byte.
      const body =
        format === "pdf"
          ? new TextDecoder("latin1").decode(await response.arrayBuffer())
          : await response.text();
      expect(body).toContain("exported card");
      for (const name of ["Zelda", "Yorick", "Xavier"]) {
        expect(body).not.toContain(name);
      }
    }
  });
});
