// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@retrobeam/shared";
import { boardStub } from "../src/board-stub.js";
import { connect, createBoard, ipHeaders, type TestSocket } from "./helpers.js";

// The group phase (owner, 2026-11-20): between presenting and voting,
// everyone sorts the cards into topics. On for a new board; a board planned
// before the phase existed keeps its plan.

let opCounter = 1;
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

async function toPhase(socket: TestSocket, phase: string) {
  socket.send({ type: "admin.phase.set", phase });
  await socket.waitForNext(
    (e) => e.type === "phase.changed" && e.phase === phase,
  );
}

async function createNote(
  socket: TestSocket,
  columnId: string,
  text: string,
): Promise<string> {
  const noteId = newId();
  socket.send({ type: "note.create", opId: opId(), noteId, columnId, text });
  await socket.waitFor(
    (e) => e.type === "note.created" && e.note.id === noteId,
  );
  return noteId;
}

describe("group phase", () => {
  it("is planned for a new board, not for one planned before it", async () => {
    // Created as the home page does it: no word about the group phase.
    const response = await SELF.fetch("https://example.com/api/boards", {
      method: "POST",
      headers: { "content-type": "application/json", ...ipHeaders() },
      body: JSON.stringify({ name: "Sprint 13" }),
    });
    const { boardId, adminToken } = (await response.json()) as {
      boardId: string;
      adminToken: string;
    };
    const anna = await joined(boardId, "Anna", adminToken);
    expect(anna.sync.config.phasePlan.group).toBe(true);

    // The same board with a plan stored before the phase existed.
    await runInDurableObject(boardStub(env, boardId), (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE board_meta SET value = ? WHERE key = 'phasePlan'",
        JSON.stringify({
          checkin: false,
          vote: true,
          discuss: true,
          close: true,
        }),
      );
    });
    const ben = await joined(boardId, "Ben");
    expect(ben.sync.config.phasePlan.group).toBe(false);
  });

  it("everyone stacks and moves cards; writing waits; the vote freezes it", async () => {
    const { boardId, adminToken } = await createBoard("Sprint 13", {
      group: true,
    });
    const admin = await joined(boardId, "Anna", adminToken);
    const ben = await joined(boardId, "Ben");
    const columnId = admin.sync.columns[0]?.id;
    const otherColumnId = admin.sync.columns[1]?.id;
    if (!columnId || !otherColumnId) throw new Error("setup");
    await toPhase(admin.socket, "write");
    const anna1 = await createNote(admin.socket, columnId, "flaky CI");
    const anna2 = await createNote(admin.socket, columnId, "slow reviews");
    const ben1 = await createNote(ben.socket, columnId, "CI is red again");
    await toPhase(admin.socket, "present");

    // With the phase planned, the vote is no longer the next step.
    admin.socket.send({ type: "admin.phase.set", phase: "vote" });
    const skipped = await admin.socket.waitForNext((e) => e.type === "reject");
    if (skipped.type !== "reject") throw new Error("unreachable");
    await toPhase(admin.socket, "group");

    // Everything is on the table for everyone (the round handed it over).
    const cara = await joined(boardId, "Cara");
    expect(cara.sync.notes.map((note) => note.id).sort()).toEqual(
      [anna1, anna2, ben1].sort(),
    );

    // A member stacks the facilitator's card onto their own…
    const group = opId();
    ben.socket.send({
      type: "note.group",
      opId: group,
      noteId: anna1,
      targetNoteId: ben1,
    });
    await ben.socket.waitFor((e) => e.type === "ack" && e.opId === group);
    const stacked = await admin.socket.waitFor(
      (e) =>
        e.type === "note.updated" &&
        e.note.id === anna1 &&
        e.note.groupId === ben1,
    );
    expect(stacked.type).toBe("note.updated");

    // …and moves another person's card to another column.
    const move = opId();
    cara.socket.send({
      type: "note.move",
      opId: move,
      noteId: anna2,
      columnId: otherColumnId,
    });
    await cara.socket.waitFor((e) => e.type === "ack" && e.opId === move);

    // Sorting, not writing: a new card waits for a rewind.
    ben.socket.send({
      type: "note.create",
      opId: opId(),
      noteId: newId(),
      columnId,
      text: "one more",
    });
    const refused = await ben.socket.waitForNext((e) => e.type === "reject");
    if (refused.type !== "reject") throw new Error("unreachable");
    expect(refused.code).toBe("PHASE_LOCKED");

    // Once the vote starts, the topics hold still.
    await toPhase(admin.socket, "vote");
    ben.socket.send({
      type: "note.ungroup",
      opId: opId(),
      noteId: anna1,
    });
    const frozen = await ben.socket.waitForNext((e) => e.type === "reject");
    if (frozen.type !== "reject") throw new Error("unreachable");
    expect(frozen.code).toBe("PHASE_LOCKED");
  });
});
