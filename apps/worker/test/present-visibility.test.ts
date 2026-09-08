// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  env,
  evictAllDurableObjects,
  runInDurableObject,
  SELF,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@retropolis/shared";
import { boardStub } from "../src/board-stub.js";
import { connect, createBoard, type TestSocket } from "./helpers.js";

// Presenter-scoped visibility: during the presenting round a member holds their
// own cards plus the cards of everyone the rotation has already put on stage.
// The facilitator holds the board throughout, and when the round can stage
// nobody else, everyone gets everything.
//
// Own test file: pool-workers isolates storage per file, and this suite drives
// a lot of boards through the same few phases.

let opCounter = 0x50000;
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
  socket.send({ type: "admin.phase.set", phase } as never);
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

/** Anna (facilitator) + Ben + Cara, one note each, sitting in "present". */
async function round() {
  const { boardId, adminToken } = await createBoard("Sprint 51");
  const anna = await joined(boardId, "Anna", adminToken);
  const ben = await joined(boardId, "Ben");
  const cara = await joined(boardId, "Cara");
  const columnId = anna.sync.columns[0]?.id;
  const otherColumn = anna.sync.columns[1]?.id;
  if (!columnId || !otherColumn) throw new Error("setup");
  await toPhase(anna.socket, "write");
  const notes = {
    anna: await write(anna, columnId, "anna's card"),
    ben: await write(ben, columnId, "ben's card"),
    cara: await write(cara, columnId, "cara's card"),
  };
  await toPhase(anna.socket, "present");
  return { boardId, anna, ben, cara, columnId, otherColumn, notes };
}

async function stage(anna: Person, participantId: string): Promise<void> {
  anna.socket.send({ type: "admin.picker.pick", participantId });
  await anna.socket.waitForNext((e) => e.type === "picker.changed");
}

async function resync(person: Person): Promise<SyncEvent> {
  person.socket.send({ type: "resync" });
  const sync = await person.socket.waitForNext((e) => e.type === "sync");
  if (sync.type !== "sync") throw new Error("unreachable");
  return sync;
}

function texts(sync: SyncEvent): string[] {
  return sync.notes.map((n) => n.text).sort();
}

describe("presenter-scoped visibility", () => {
  it("hands a member nothing until the rotation reaches someone", async () => {
    const { ben } = await round();
    expect(texts(await resync(ben))).toEqual(["ben's card"]);
    // Not on the wire either — not even the note id.
    expect(JSON.stringify(ben.socket.events)).not.toContain("anna's card");
    expect(JSON.stringify(ben.socket.events)).not.toContain("cara's card");
  });

  it("gives the facilitator the whole board from the moment the phase flips", async () => {
    const { anna } = await round();
    expect(texts(await resync(anna))).toEqual([
      "anna's card",
      "ben's card",
      "cara's card",
    ]);
  });

  it("delivers exactly the cards of the person taking the stage", async () => {
    const { anna, ben, cara } = await round();
    await stage(anna, cara.you.id);
    const revealed = await ben.socket.waitForNext(
      (e) => e.type === "notes.revealed",
    );
    if (revealed.type !== "notes.revealed") throw new Error("unreachable");
    expect(revealed.notes.map((n) => n.text)).toEqual(["cara's card"]);
    expect(texts(await resync(ben))).toEqual(["ben's card", "cara's card"]);
    // Anna is still to come, and the room must not have her yet.
    expect(JSON.stringify(ben.socket.events)).not.toContain("anna's card");
  });

  it("accumulates: a second presenter adds to the board, never replaces it", async () => {
    const { anna, ben, cara } = await round();
    await stage(anna, cara.you.id);
    await ben.socket.waitForNext((e) => e.type === "notes.revealed");
    await stage(anna, anna.you.id);
    await ben.socket.waitForNext((e) => e.type === "notes.revealed");
    expect(texts(await resync(ben))).toEqual([
      "anna's card",
      "ben's card",
      "cara's card",
    ]);
  });

  // The single most important guarantee here: once the room has read a card it
  // never loses it. `presented` is retractable (a skip puts the person back in
  // the pool), which is exactly why visibility is tracked separately.
  it("a skip does not take back a card the room has already read", async () => {
    const { anna, ben, cara } = await round();
    await stage(anna, cara.you.id);
    await ben.socket.waitForNext((e) => e.type === "notes.revealed");

    anna.socket.send({ type: "admin.picker.skip" });
    const changed = await anna.socket.waitForNext(
      (e) => e.type === "picker.changed",
    );
    if (changed.type !== "picker.changed") throw new Error("unreachable");
    // Back in the rotation…
    expect(changed.picker.remaining).toContain(cara.you.id);
    expect(changed.picker.presented).not.toContain(cara.you.id);
    // …but their cards stay on the room's screens.
    expect(changed.picker.revealed).toContain(cara.you.id);
    expect(ben.socket.events.some((e) => e.type === "note.deleted")).toBe(
      false,
    );
    expect(texts(await resync(ben))).toEqual(["ben's card", "cara's card"]);
  });

  it("hands the rest of the board over when the round is finished", async () => {
    const { anna, ben, cara } = await round();
    // Cara is taken off the wheel entirely and never presents.
    anna.socket.send({
      type: "admin.picker.exclude",
      participantId: cara.you.id,
    });
    await anna.socket.waitForNext((e) => e.type === "picker.changed");
    await stage(anna, anna.you.id);
    await ben.socket.waitForNext((e) => e.type === "notes.revealed");
    await stage(anna, ben.you.id);
    ben.socket.send({ type: "picker.done" });
    await ben.socket.waitForNext((e) => e.type === "picker.changed");

    // Nobody left to stage — an excluded person's cards must not stay dark.
    expect(texts(await resync(ben))).toEqual([
      "anna's card",
      "ben's card",
      "cara's card",
    ]);
  });

  it("a member joining mid-round gets only what the room has been shown", async () => {
    const { boardId, anna, cara } = await round();
    await stage(anna, cara.you.id);
    const dan = await joined(boardId, "Dan");
    expect(texts(dan.sync)).toEqual(["cara's card"]);
  });

  it("reject codes stay sealed: an unpresented card answers like a missing one", async () => {
    const { anna, ben, otherColumn, notes } = await round();
    const annaCard = notes.anna;

    ben.socket.send({
      type: "note.update",
      opId: opId(),
      noteId: annaCard,
      text: "hijacked",
    });
    const updated = await ben.socket.waitForNext((e) => e.type === "reject");
    if (updated.type !== "reject") throw new Error("unreachable");
    expect(updated.code).toBe("NOT_FOUND"); // not NOT_AUTHOR — no oracle

    ben.socket.send({
      type: "note.move",
      opId: opId(),
      noteId: annaCard,
      columnId: otherColumn,
    });
    const moved = await ben.socket.waitForNext((e) => e.type === "reject");
    if (moved.type !== "reject") throw new Error("unreachable");
    expect(moved.code).toBe("NOT_FOUND");

    ben.socket.send({
      type: "note.react",
      opId: opId(),
      noteId: annaCard,
      emoji: "🎉",
      on: true,
    });
    const reacted = await ben.socket.waitForNext((e) => e.type === "reject");
    if (reacted.type !== "reject") throw new Error("unreachable");
    expect(reacted.code).toBe("NOT_FOUND");

    // note.group has to test TWO notes, so its check is hand-written and the
    // compiler cannot enumerate it — assert it explicitly.
    ben.socket.send({
      type: "note.group",
      opId: opId(),
      noteId: notes.ben,
      targetNoteId: annaCard,
    });
    const grouped = await ben.socket.waitForNext((e) => e.type === "reject");
    if (grouped.type !== "reject") throw new Error("unreachable");
    expect(grouped.code).toBe("NOT_FOUND");

    // Deleting is a silent idempotent ack — and must not delete anything.
    ben.socket.send({ type: "note.delete", opId: opId(), noteId: annaCard });
    await ben.socket.waitForNext((e) => e.type === "ack");
    expect(texts(await resync(anna))).toContain("anna's card");
  });

  it("a stack that spans the boundary reaches a member ungrouped", async () => {
    const { anna, ben, cara, notes } = await round();
    await stage(anna, cara.you.id);
    await ben.socket.waitForNext((e) => e.type === "notes.revealed");
    // The facilitator, who sees everything, stacks Cara's card onto Anna's —
    // and the stack's id IS Anna's note id, which Ben has not been shown.
    anna.socket.send({
      type: "note.group",
      opId: opId(),
      noteId: notes.cara,
      targetNoteId: notes.anna,
    });
    await anna.socket.waitForNext(
      (e) => e.type === "note.updated" && e.note.id === notes.cara,
    );
    const bensView = await resync(ben);
    expect(bensView.notes.find((n) => n.text === "cara's card")?.groupId).toBe(
      null,
    );
    expect(JSON.stringify(ben.socket.events)).not.toContain(notes.anna);

    // Once Anna takes the stage the stack becomes real for Ben too.
    await stage(anna, anna.you.id);
    await ben.socket.waitForNext((e) => e.type === "notes.revealed");
    const after = await resync(ben);
    expect(after.notes.find((n) => n.text === "cara's card")?.groupId).toBe(
      notes.anna,
    );
  });

  it("unstacking a card whose anchor is invisible is indistinguishable from unstacking a loose one", async () => {
    const { anna, ben, cara, notes } = await round();
    await stage(anna, cara.you.id);
    await ben.socket.waitForNext((e) => e.type === "notes.revealed");
    // The facilitator stacks Ben's own card onto Anna's, who is not on stage.
    // Ben's copy arrives ungrouped, so the command has to answer as if it were.
    anna.socket.send({
      type: "note.group",
      opId: opId(),
      noteId: notes.ben,
      targetNoteId: notes.anna,
    });
    await anna.socket.waitForNext(
      (e) => e.type === "note.updated" && e.note.id === notes.ben,
    );

    // Grouping legitimately re-sends Ben his own card (ungrouped) — count from
    // there, so only what the UNGROUP produces is measured.
    const before = ben.socket.events.length;
    ben.socket.send({ type: "note.ungroup", opId: opId(), noteId: notes.ben });
    await ben.socket.waitForNext((e) => e.type === "ack");
    // A bare ack and nothing else: a following note.updated would tell Ben his
    // card is stacked with one the rotation has not reached.
    await resync(ben); // a round trip anything queued would have arrived within
    expect(
      ben.socket.events.slice(before).filter((e) => e.type === "note.updated"),
    ).toHaveLength(0);
    // And the stack itself is intact — a member cannot destroy what they were
    // never shown.
    const annaView = await resync(anna);
    expect(annaView.notes.find((n) => n.id === notes.ben)?.groupId).toBe(
      notes.anna,
    );
  });

  it("ghost cards do not announce an unpresented card's column", async () => {
    const { anna, ben, columnId } = await round();
    anna.socket.send({ type: "presence.editing", columnId });
    // Nothing to wait for — assert the absence after a round trip that would
    // have carried it.
    await resync(ben);
    expect(ben.socket.events.some((e) => e.type === "presence.editing")).toBe(
      false,
    );
  });

  it("leaving the round opens the board and a rewind back does not close it", async () => {
    const { anna, ben } = await round();
    await stage(anna, anna.you.id);
    await ben.socket.waitForNext((e) => e.type === "notes.revealed");
    await toPhase(anna.socket, "vote");
    expect(texts(await resync(ben))).toEqual([
      "anna's card",
      "ben's card",
      "cara's card",
    ]);

    // A rewind INTO the presenting phase must not take the board back — the
    // room is already reading it.
    await toPhase(anna.socket, "present");
    expect(ben.socket.events.some((e) => e.type === "note.deleted")).toBe(
      false,
    );
    expect(texts(await resync(ben))).toEqual([
      "anna's card",
      "ben's card",
      "cara's card",
    ]);
  });

  it("a rewind to write starts a fresh, scoped round", async () => {
    const { anna, ben, cara } = await round();
    await stage(anna, cara.you.id);
    await ben.socket.waitForNext((e) => e.type === "notes.revealed");
    cara.socket.send({ type: "picker.done" });
    await cara.socket.waitForNext((e) => e.type === "picker.changed");

    await toPhase(anna.socket, "write");
    expect(texts(await resync(ben))).toEqual(["ben's card"]);
    // Back in: Cara stays in `presented` (the rotation survives rewinds), but
    // the ROOM has to be shown her cards again — otherwise a second round on
    // the same board would start with everyone's new cards already visible.
    await toPhase(anna.socket, "present");
    expect(texts(await resync(ben))).toEqual(["ben's card"]);
  });

  it("a rewind does not strand whoever is still holding the mic", async () => {
    const { anna, ben, cara } = await round();
    await stage(anna, cara.you.id);
    await ben.socket.waitForNext((e) => e.type === "notes.revealed");

    // Cara never stepped down, so she is still `current` when the board comes
    // back. Clearing the reveal around her would leave her presenting to a room
    // that had been shown none of her cards, with no second chance to be added:
    // withPresenterRevealed only runs when somebody is DRAWN.
    await toPhase(anna.socket, "write");
    await toPhase(anna.socket, "present");
    expect(texts(await resync(ben))).toEqual(["ben's card", "cara's card"]);

    // …and moving on still works: Anna joins the visible set, Cara stays.
    await stage(anna, anna.you.id);
    await ben.socket.waitForNext((e) => e.type === "notes.revealed");
    expect(texts(await resync(ben))).toEqual([
      "anna's card",
      "ben's card",
      "cara's card",
    ]);
  });

  it("a fresh board is never mistaken for one written before this shipped", async () => {
    // The version marker is stamped at creation, not by migrate() — the
    // constructor runs before the board row exists, so a board that never got
    // stamped would read as version 0 and take the back-compat step (which
    // latches the whole board open) the first time it woke during the round.
    const { anna, ben } = await round();
    await stage(anna, ben.you.id);
    await evictAllDurableObjects();
    const rejoined = await joined(anna.sync.board.id, "Dora");
    expect(texts(rejoined.sync)).toEqual(["ben's card"]);
  });

  it("promotion hands over the board; demotion takes it back", async () => {
    const { anna, ben } = await round();
    anna.socket.send({
      type: "admin.role.set",
      participantId: ben.you.id,
      role: "facilitator",
    });
    const promoted = await ben.socket.waitForNext((e) => e.type === "sync");
    if (promoted.type !== "sync") throw new Error("unreachable");
    expect(texts(promoted)).toEqual([
      "anna's card",
      "ben's card",
      "cara's card",
    ]);

    anna.socket.send({
      type: "admin.role.set",
      participantId: ben.you.id,
      role: "member",
    });
    const rescoped = await ben.socket.waitForNext((e) => e.type === "sync");
    if (rescoped.type !== "sync") throw new Error("unreachable");
    expect(texts(rescoped)).toEqual(["ben's card"]);
  });

  it("the export is not a way around the round", async () => {
    // The route is open to any holder of the board id — which every
    // participant has — so it has to carry what a viewer with NO identity may
    // read, not what the facilitator sees.
    const { boardId, anna, cara } = await round();
    const mid = await SELF.fetch(
      `https://example.com/api/boards/${boardId}/export?format=md`,
    );
    const before = await mid.text();
    expect(before).not.toContain("anna's card");
    expect(before).not.toContain("cara's card");

    await stage(anna, cara.you.id);
    const after = await (
      await SELF.fetch(
        `https://example.com/api/boards/${boardId}/export?format=md`,
      )
    ).text();
    expect(after).toContain("cara's card");
    expect(after).not.toContain("anna's card");
  });

  it("the last person in the pool leaving ends the round", async () => {
    // Otherwise a closed laptop leaves the room staring at a board only the
    // facilitator can read, with nobody left to stage.
    const { anna, ben, cara } = await round();
    for (const person of [anna, ben]) {
      await stage(anna, person.you.id);
      person.socket.send({ type: "picker.done" });
      await anna.socket.waitForNext((e) => e.type === "picker.changed");
    }
    // Cara is now the only one still waiting — and she disconnects.
    cara.socket.ws.close();
    await ben.socket.waitForNext(
      (e) => e.type === "picker.changed" && e.picker.revealedAll,
    );
    expect(texts(await resync(ben))).toEqual([
      "anna's card",
      "ben's card",
      "cara's card",
    ]);
  });

  it("an anonymous board is never scoped — anonymity is the stronger promise", async () => {
    const { boardId, adminToken } = await createBoard("Anon");
    const anna = await joined(boardId, "Anna", adminToken);
    const ben = await joined(boardId, "Ben");
    const columnId = anna.sync.columns[0]?.id;
    if (!columnId) throw new Error("setup");
    // Anonymity is only reachable through duplication today, so seed it the
    // way m6 does — directly, then reconnect.
    await runInDurableObject(boardStub(env, boardId), (_i, state) => {
      state.storage.sql.exec(
        "INSERT INTO board_meta (key, value) VALUES ('anonymous', '1') ON CONFLICT(key) DO UPDATE SET value = '1'",
      );
    });
    await toPhase(anna.socket, "write");
    await write(anna, columnId, "anna's anonymous card");
    await toPhase(anna.socket, "present");

    // Scoping by author on an anonymous board would hand a member the author of
    // every card, one presenter at a time. So it is off — everything at once,
    // with authorship stripped.
    const sync = await resync(ben);
    expect(sync.notes.map((n) => n.text)).toContain("anna's anonymous card");
    expect(
      sync.notes.find((n) => n.text === "anna's anonymous card")?.authorId,
    ).toBe(null);
  });

  it("a board already presenting when this shipped stays open", async () => {
    const { boardId, adminToken } = await createBoard("Legacy");
    const anna = await joined(boardId, "Anna", adminToken);
    const columnId = anna.sync.columns[0]?.id;
    if (!columnId) throw new Error("setup");
    await toPhase(anna.socket, "write");
    await write(anna, columnId, "legacy card");
    await toPhase(anna.socket, "present");

    // Rewind the board to what the previous release would have persisted: the
    // old schema marker and a picker without the visibility fields. Without the
    // migration, redeploying would retract cards from a live retro.
    await runInDurableObject(boardStub(env, boardId), (_i, state) => {
      state.storage.sql.exec(
        "DELETE FROM board_meta WHERE key = 'schemaVersion'",
      );
      state.storage.sql.exec(
        "UPDATE board_meta SET value = ? WHERE key = 'picker'",
        JSON.stringify({
          remaining: [],
          presented: [],
          current: null,
          excluded: [],
        }),
      );
    });
    await evictAllDurableObjects(); // forces migrate() to run on the next wake
    const rejoined = await joined(boardId, "Ben");
    expect(rejoined.sync.notes.map((n) => n.text)).toContain("legacy card");
  });
});
