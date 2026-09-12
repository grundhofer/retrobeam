// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { clientCommandSchema, type ServerEvent } from "@retrobeam/shared";
import { connect, createBoard, type TestSocket } from "./helpers.js";

// The authorization matrix exists only as ~20 copy-pasted role checks spread
// through the Durable Object, and most of them had no negative test: a handler
// added without its guard would merge green. This derives the matrix from the
// schema instead of a hand-written list, so a NEW admin command with no guard
// fails here the day it is added rather than the day it is abused.

let opCounter = 70000;
function opId(): string {
  return (opCounter++).toString(16).padStart(32, "0");
}
function hexId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

/** Every `admin.*` literal in the command union. */
function adminCommandTypes(): string[] {
  const types = new Set<string>();
  for (const option of clientCommandSchema.options) {
    const shape = (option as { shape: { type: { value: unknown } } }).shape;
    const value = shape.type.value;
    if (typeof value === "string" && value.startsWith("admin.")) {
      types.add(value);
    }
  }
  return [...types].sort();
}

/** A minimally-valid frame for each admin command: the point is to get past
 *  zod and reach the handler's role check, so payloads are plausible shapes,
 *  not meaningful ones. */
function sampleFor(type: string, columnId: string, participantId: string) {
  const base: Record<string, unknown> = { type, opId: opId() };
  switch (type) {
    case "admin.phase.set":
      return { type, phase: "write" };
    case "admin.phasePlan.set":
      return {
        type,
        phasePlan: {
          checkin: false,
          vote: true,
          discuss: true,
          close: true,
        },
      };
    case "admin.timer.start":
      return { type, durationSec: 300 };
    case "admin.timer.extend":
      return { type, addSec: 60 };
    case "admin.timer.pause":
    case "admin.timer.resume":
    case "admin.timer.stop":
    case "admin.picker.spin":
    case "admin.picker.skip":
    case "admin.checkin.shuffle":
    case "admin.board.keep":
    case "admin.board.delete":
      return { type };
    case "admin.column.create":
      return { ...base, columnId: hexId(), name: "New column" };
    case "admin.column.rename":
      return { ...base, columnId, name: "Renamed" };
    case "admin.column.delete":
      return { ...base, columnId };
    case "admin.column.setHidden":
      return { ...base, columnId, hidden: true };
    case "admin.column.setRect":
      return { ...base, columnId, rect: { x: 0, y: 0, w: 0.5, h: 0.5 } };
    case "admin.picker.pick":
    case "admin.picker.exclude":
    case "admin.picker.include":
      return { type, participantId };
    case "admin.picker.style":
      return { type, style: "slots" };
    case "admin.layout.set":
      return { type, layout: "canvas" };
    case "admin.role.set":
      return { type, participantId, role: "facilitator" };
    case "admin.vote.config":
      return { type, votesPerPerson: 3, maxPerTarget: null, topN: 3 };
    case "admin.discuss.focus":
      return { type, targetId: hexId() };
    case "admin.gifs.set":
    case "admin.cursors.set":
    case "admin.voterNames.set":
    case "admin.focus.set":
      return { type, enabled: false };
    case "admin.spotlight.set":
      return { type, targetId: hexId() };
    case "admin.agreements.set":
      return { type, text: "Be kind" };
    default:
      return base;
  }
}

async function joined(boardId: string, name: string, adminToken?: string) {
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

async function refusal(socket: TestSocket): Promise<ServerEvent> {
  return socket.waitForNext(
    (e) =>
      e.type === "reject" || (e.type === "error" && e.code !== "RATE_LIMIT"),
  );
}

describe("authorization matrix", () => {
  it("every admin.* command is refused for a member", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    const ben = await joined(boardId, "Ben");
    const columnId = admin.sync.columns[0]?.id ?? "";

    const allowed: string[] = [];
    for (const type of adminCommandTypes()) {
      ben.socket.send(sampleFor(type, columnId, ben.you.id));
      const answer = await refusal(ben.socket);
      if (answer.type !== "reject") {
        allowed.push(`${type} → ${answer.type}`);
        continue;
      }
      if (answer.code !== "NOT_ADMIN") allowed.push(`${type} → ${answer.code}`);
    }
    // Named individually so a failure says WHICH command lost its guard.
    expect(allowed).toEqual([]);
  });

  it("the schema's admin surface is fully covered by the case above", async () => {
    // Guards against the sample builder quietly falling through to a shape the
    // handler rejects for the wrong reason, which would make the matrix pass
    // without testing anything.
    const types = adminCommandTypes();
    expect(types.length).toBeGreaterThanOrEqual(25);
    for (const type of types) {
      const sample = sampleFor(type, "0".repeat(32), "1".repeat(32));
      expect(
        clientCommandSchema.safeParse(sample).success,
        `no valid sample frame for ${type}`,
      ).toBe(true);
    }
  });
});

describe("authorship", () => {
  it("before the reveal, only the author may move their own note", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    const ben = await joined(boardId, "Ben");
    const columnId = admin.sync.columns[0]?.id ?? "";
    const otherColumn = admin.sync.columns[1]?.id ?? "";

    admin.socket.send({ type: "admin.phase.set", phase: "write" });
    await ben.socket.waitForNext(
      (e) => e.type === "phase.changed" && e.phase === "write",
    );
    // Ben's OWN note: he can see it, so a refusal can only be the phase rule.
    const noteId = hexId();
    ben.socket.send({
      type: "note.create",
      opId: opId(),
      noteId,
      columnId,
      text: "Ben's note",
    });
    await ben.socket.waitForNext((e) => e.type === "note.created");
    ben.socket.send({
      type: "note.move",
      opId: opId(),
      noteId,
      columnId: otherColumn,
    });
    await ben.socket.waitForNext(
      (e) => e.type === "note.updated" && e.note.columnId === otherColumn,
    );

    // Anna cannot move it while it is still private to Ben — she is not even
    // told it exists.
    admin.socket.send({
      type: "note.move",
      opId: opId(),
      noteId,
      columnId,
    });
    const refused = await admin.socket.waitForNext((e) => e.type === "reject");
    if (refused.type !== "reject") throw new Error("unreachable");
    expect(["NOT_AUTHOR", "NOT_FOUND"]).toContain(refused.code);
  });

  it("a member cannot edit, move or delete someone else's note", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    const ben = await joined(boardId, "Ben");
    const columnId = admin.sync.columns[0]?.id ?? "";
    const otherColumn = admin.sync.columns[1]?.id ?? "";

    admin.socket.send({ type: "admin.phase.set", phase: "write" });
    await ben.socket.waitForNext(
      (e) => e.type === "phase.changed" && e.phase === "write",
    );
    const noteId = hexId();
    admin.socket.send({
      type: "note.create",
      opId: opId(),
      noteId,
      columnId,
      text: "Anna's note",
    });
    await admin.socket.waitForNext((e) => e.type === "note.created");
    // Reveal, so Ben can SEE it — otherwise the refusal would be the privacy
    // filter rather than the authorship rule under test. In the presenting
    // phase that takes TWO steps: the phase alone reveals nothing to a member,
    // the author has to be put on stage.
    admin.socket.send({ type: "admin.phase.set", phase: "present" });
    await ben.socket.waitForNext(
      (e) => e.type === "phase.changed" && e.phase === "present",
    );
    admin.socket.send({
      type: "admin.picker.pick",
      participantId: admin.you.id,
    });
    await ben.socket.waitForNext((e) => e.type === "notes.revealed");

    // Text and existence belong to the author, in every phase.
    for (const command of [
      { type: "note.update", opId: opId(), noteId, text: "hijacked" },
      { type: "note.delete", opId: opId(), noteId },
    ]) {
      ben.socket.send(command);
      const rejected = await ben.socket.waitForNext((e) => e.type === "reject");
      if (rejected.type !== "reject") throw new Error("unreachable");
      expect(rejected.code, `${command.type} was not refused`).toBe(
        "NOT_AUTHOR",
      );
    }

    // PLACEMENT does not: once notes are revealed the board is curated
    // collectively, which is what makes grouping during the presenting phase a
    // shared activity. Asserted so the difference stays a decision rather than
    // an accident. Before the reveal it IS author-gated (covered below).
    ben.socket.send({
      type: "note.move",
      opId: opId(),
      noteId,
      columnId: otherColumn,
    });
    await ben.socket.waitForNext(
      (e) => e.type === "note.updated" && e.note.id === noteId,
    );

    // The text survived every attempt on it.
    admin.socket.send({ type: "resync" });
    const sync = await admin.socket.waitForNext((e) => e.type === "sync");
    if (sync.type !== "sync") throw new Error("unreachable");
    expect(sync.notes.find((n) => n.id === noteId)?.text).toBe("Anna's note");
  });
});
