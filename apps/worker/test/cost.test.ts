// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later
// docs/02 §8 rule 6 says "count what we spend" so the free-tier ceiling is
// visible weeks before it is hit. Nothing did. This plays one realistic retro
// — eight people, forty notes, the whole phase flow — and holds the measured
// cost to a ceiling.
//
// The bounds are deliberately loose (roughly 2-3x the measured figures): this
// is a canary for a change that adds a write per keystroke or turns a broadcast
// into a full-table scan per recipient, not a benchmark. If it trips, look at
// what the change made the board do per event before raising the numbers.

import { env, runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import { boardStub } from "../src/board-stub.js";
import { connect, createBoard, type TestSocket } from "./helpers.js";

let opCounter = 500000;
const opId = () => (opCounter++).toString(16).padStart(32, "0");
const newId = () => crypto.randomUUID().replaceAll("-", "");

let inbound = 0;
async function joined(boardId: string, name: string, adminToken?: string) {
  const socket = await connect(boardId);
  const send = socket.send.bind(socket);
  socket.send = (c: unknown) => {
    inbound += 1;
    send(c);
  };
  socket.send({
    type: "join",
    name,
    ...(adminToken === undefined ? {} : { adminToken }),
  });
  const sync = await socket.waitFor((e) => e.type === "sync");
  if (sync.type !== "sync") throw new Error("unreachable");
  return { socket, you: sync.you, sync };
}

async function toPhase(socket: TestSocket, phase: string) {
  socket.send({ type: "admin.phase.set", phase });
  await socket.waitForNext(
    (e) => e.type === "phase.changed" && e.phase === phase,
  );
}

it("one full retro stays well inside a day's free-tier budget", async () => {
  const { boardId, adminToken } = await createBoard("Cost probe");
  const stub = boardStub(env, boardId);

  // Count every row the board touches by wrapping its SqlStorage. `readonly` is
  // a compile-time notion; the property is writable at runtime.
  let rowsRead = 0;
  let rowsWritten = 0;
  await runInDurableObject(stub, (instance) => {
    const target = (instance as unknown as { sql: SqlStorage }).sql;
    (instance as unknown as { sql: SqlStorage }).sql = {
      ...target,
      exec: (query: string, ...bindings: unknown[]) => {
        const cursor = target.exec(query, ...bindings);
        const array = cursor.toArray();
        rowsRead += cursor.rowsRead;
        rowsWritten += cursor.rowsWritten;
        return {
          toArray: () => array,
          one: () => array[0],
          [Symbol.iterator]: () => array[Symbol.iterator](),
          next: () => ({ done: true }),
          raw: () => [][Symbol.iterator](),
          columnNames: cursor.columnNames,
          rowsRead: cursor.rowsRead,
          rowsWritten: cursor.rowsWritten,
        } as unknown as ReturnType<SqlStorage["exec"]>;
      },
    } as unknown as SqlStorage;
  });

  const admin = await joined(boardId, "Anna", adminToken);
  const members = [];
  for (const name of ["Ben", "Cara", "Dan", "Eve", "Finn", "Gus", "Hana"]) {
    members.push(await joined(boardId, name));
  }
  const everyone = [admin, ...members];
  const columns = admin.sync.columns.map((c) => c.id);
  const columnId = columns[0] as string;

  await toPhase(admin.socket, "write");
  const notes: string[] = [];
  for (const person of everyone) {
    for (let i = 0; i < 5; i++) {
      const noteId = newId();
      notes.push(noteId);
      person.socket.send({ type: "presence.editing", columnId });
      person.socket.send({
        type: "note.create",
        opId: opId(),
        noteId,
        columnId: columns[i % columns.length] as string,
        text: `${person.you.name} point ${i}`,
      });
      await person.socket.waitForNext(
        (e) => e.type === "note.created" && e.note.id === noteId,
      );
      person.socket.send({ type: "presence.editing", columnId: null });
    }
    person.socket.send({ type: "ready.set", ready: true });
  }

  await toPhase(admin.socket, "present");
  admin.socket.send({ type: "admin.picker.spin" });
  const spun = await admin.socket.waitForNext((e) => e.type === "picker.spun");
  if (spun.type !== "picker.spun") throw new Error("unreachable");
  // React to a card the room can actually read: only the person the wheel put
  // on stage has had their notes handed out. Each author wrote five notes in a
  // row, so their block starts at (index × 5).
  const stage = everyone.findIndex((p) => p.you.id === spun.winnerId);
  const staged = notes[stage * 5] as string;
  for (const person of everyone.slice(0, 4)) {
    person.socket.send({
      type: "note.react",
      opId: opId(),
      noteId: staged,
      emoji: "🎉",
      on: true,
    });
    await person.socket.waitForNext((e) => e.type === "note.updated");
  }

  await toPhase(admin.socket, "vote");
  for (const person of everyone) {
    for (let n = 0; n < 3; n++) {
      person.socket.send({
        type: "vote.cast",
        opId: opId(),
        targetId: notes[n] as string,
        count: 1,
      });
      await person.socket.waitForNext((e) => e.type === "vote.progress");
    }
  }

  await toPhase(admin.socket, "discuss");
  for (let i = 0; i < 5; i++) {
    admin.socket.send({
      type: "admin.discuss.focus",
      targetId: notes[i] as string,
    });
    await admin.socket.waitForNext((e) => e.type === "discuss.focus");
    admin.socket.send({
      type: "action.create",
      opId: opId(),
      actionId: newId(),
      text: `Action ${i}`,
      ownerId: null,
    });
    await admin.socket.waitForNext((e) => e.type === "action.created");
  }

  await toPhase(admin.socket, "close");
  for (const person of everyone) {
    person.socket.send({
      type: "kudo.create",
      opId: opId(),
      kudoId: newId(),
      cardType: "great-job",
      toId: admin.you.id,
      text: "nice work",
      anonymous: false,
    });
    await person.socket.waitForNext((e) => e.type === "kudo.created");
    person.socket.send({ type: "roti.set", score: 4 });
    await person.socket.waitForNext((e) => e.type === "roti.you");
  }
  await toPhase(admin.socket, "done");

  // Measured 2026-09-05: 197 inbound, 553 written, 10,902 read.
  //
  // Incoming WebSocket messages are billed at a 20:1 DISCOUNT, so requests are
  // nowhere near the limit — about 18 per retro against 100k/day. ROWS WRITTEN
  // is the real ceiling at ~180 retros a day, which is the opposite of what
  // docs/02 §1 originally assumed. Reads are second at ~460 a day, and they are
  // the number that grows with board size, since a join reads the whole board.
  expect(inbound).toBeLessThan(400);
  expect(rowsWritten).toBeLessThan(1500);
  expect(rowsRead).toBeLessThan(30_000);

  // Per participant, for the WHOLE session — the per-socket budget allows eight
  // frames a SECOND, so a real person is about three orders of magnitude away
  // from noticing it.
  expect(inbound / everyone.length).toBeLessThan(50);
});
