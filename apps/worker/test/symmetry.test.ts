// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  applyServerEvent,
  initialBoardState,
  type ClientBoardState,
  type ServerEvent,
} from "@retropolis/shared";
import { connect, createBoard, type TestSocket } from "./helpers.js";

// The architecture doc's load-bearing claim (docs/02 §5) is that both ends
// share one reducer, so "reconciliation is symmetric by construction": folding
// the events a participant actually received must reproduce the snapshot they
// would be handed on a fresh resync. Nothing asserted it. Every other test
// checks one event or one snapshot; this checks that the two agree, which is
// what makes an optimistic client safe to leave running for an hour.
//
// It is also the safety net for thinning the Durable Object: any extraction
// that changes WHAT is sent, rather than where the code lives, breaks here.

let opCounter = 90000;
function opId(): string {
  return (opCounter++).toString(16).padStart(32, "0");
}
function newId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

type SyncEvent = Extract<ServerEvent, { type: "sync" }>;

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

// waitForNext, not waitFor: a rewind revisits a phase, so matching the whole
// log would be satisfied by the FIRST time the board was in it and return
// before the rewind had happened at all.
async function toPhase(socket: TestSocket, phase: string) {
  socket.send({ type: "admin.phase.set", phase });
  await socket.waitForNext(
    (e) => e.type === "phase.changed" && e.phase === phase,
  );
}

function fold(events: readonly ServerEvent[]): ClientBoardState {
  return events.reduce(applyServerEvent, initialBoardState);
}

/** Fields that legitimately differ between a fold and a fresh snapshot, each
 *  for a reason that is part of the protocol rather than a defect:
 *
 *  - `lastSeq`: the fold ends on the last incremental event, the snapshot on
 *    the sync's own seq. Per-recipient filtering means a member's stream has
 *    legitimate holes, which is also why gap detection is not implemented.
 *  - `editing` / `cursors`: presence is never persisted (arch §8 rule 3), so a
 *    snapshot cannot carry it and a fold necessarily has more.
 *  - `lastSpin`: the snapshot carries only a spin still animating; the fold
 *    keeps the last one it saw so a late joiner is not left mid-wheel.
 *  - the vote meter, OUTSIDE the vote phase only: broadcastMeter returns early
 *    unless the board is voting, so a client's copy is deliberately stale until
 *    entering "vote" force-refreshes it. Inside the vote phase it is compared.
 *  - `you.sessionKey`: stripped by the reducer, absent from the comparison. */
function comparable(state: ClientBoardState) {
  const {
    lastSeq: _lastSeq,
    editing: _editing,
    cursors: _cursors,
    lastSpin: _lastSpin,
    votes,
    ...rest
  } = state;
  const { votersDone: _done, votersTotal: _total, ...blindVotes } = votes;
  // Collections are compared as content, not as arrays: the reducer appends in
  // arrival order while a snapshot comes back in query order, and every render
  // path sorts by (order, id) before drawing (the write phase draws that same
  // key descending, so the composer stays put — still a pure render decision).
  // What must agree is WHICH entities exist and what they hold.
  const byId = <T extends { id: string }>(items: readonly T[]) =>
    [...items].sort((a, b) => a.id.localeCompare(b.id));
  const collections = {
    notes: byId(rest.notes),
    roster: byId(rest.roster),
    columns: byId(rest.columns),
    actions: byId(rest.actions),
    kudos: byId(rest.kudos),
    readyIds: [...rest.readyIds].sort(),
  };
  return state.phase === "vote"
    ? { ...rest, ...collections, votes }
    : { ...rest, ...collections, votes: blindVotes };
}

/** Ask for a fresh snapshot, then fold everything that arrived BEFORE it.
 *
 *  The socket's own ordering is what makes this exact: every broadcast the
 *  server had already sent is delivered ahead of the sync it answers with, so
 *  the events preceding the sync in the log are precisely "what this
 *  participant knew when the server built that snapshot". Folding on a timer
 *  instead would race the delivery. */
async function expectConvergence(socket: TestSocket, label: string) {
  socket.send({ type: "resync" });
  const snapshot = await socket.waitForNext((e) => e.type === "sync");
  if (snapshot.type !== "sync") throw new Error("unreachable");
  const streamed = fold(
    socket.events.slice(0, socket.events.indexOf(snapshot)),
  );
  expect(
    comparable(applyServerEvent(initialBoardState, snapshot)),
    `stream and snapshot disagree for ${label}`,
  ).toEqual(comparable(streamed));
  return snapshot as SyncEvent;
}

describe("stream/snapshot convergence", () => {
  // Each case gets its own board and sockets. A single walk-the-whole-flow test
  // would also spend the per-socket resync budget (Week 2's token bucket), and
  // one failure would tell you far less about where symmetry broke.
  async function boardWith(phases: readonly string[]) {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    const ben = await joined(boardId, "Ben");
    const cara = await joined(boardId, "Cara");
    const columns = admin.sync.columns.map((c) => c.id);
    const columnId = columns[0];
    const otherColumn = columns[1];
    if (!columnId || !otherColumn) throw new Error("setup");

    await toPhase(admin.socket, "write");
    const notes: Record<string, string> = {};
    for (const [who, socket] of [
      ["anna", admin.socket],
      ["ben", ben.socket],
      ["cara", cara.socket],
    ] as const) {
      const noteId = newId();
      notes[who] = noteId;
      socket.send({
        type: "note.create",
        opId: opId(),
        noteId,
        columnId,
        text: `${who}'s point`,
      });
      await socket.waitForNext(
        (e) => e.type === "note.created" && e.note.id === noteId,
      );
    }
    for (const phase of phases) await toPhase(admin.socket, phase);
    return { boardId, admin, ben, cara, columnId, otherColumn, notes };
  }

  it("write: private notes, ghost presence and per-column totals", async () => {
    const { admin, ben, columnId } = await boardWith([]);
    ben.socket.send({ type: "presence.editing", columnId });
    ben.socket.send({ type: "ready.set", ready: true });
    await admin.socket.waitForNext((e) => e.type === "ready.changed");
    await expectConvergence(ben.socket, "member in write");
    await expectConvergence(admin.socket, "facilitator in write");
  });

  it("present: the reveal, a stack, a staged column and a spin", async () => {
    const { admin, ben, otherColumn, notes } = await boardWith(["present"]);
    admin.socket.send({
      type: "note.group",
      opId: opId(),
      noteId: notes.ben as string,
      targetNoteId: notes.anna as string,
    });
    // Waited for on the ADMIN's socket, not Ben's. Ben's own note is stacked
    // onto Anna's, and Anna is not on stage yet — a stack's id IS its anchor
    // note's id, so Ben's copy arrives with groupId stripped rather than
    // naming a card he has not been shown.
    await admin.socket.waitForNext(
      (e) => e.type === "note.updated" && e.note.groupId !== null,
    );
    admin.socket.send({
      type: "admin.column.setHidden",
      opId: opId(),
      columnId: otherColumn,
      hidden: true,
    });
    await ben.socket.waitForNext(
      (e) => e.type === "column.deleted" && e.columnId === otherColumn,
    );
    admin.socket.send({ type: "admin.picker.spin" });
    await ben.socket.waitForNext((e) => e.type === "picker.spun");
    await expectConvergence(ben.socket, "member in present");
    await expectConvergence(admin.socket, "facilitator in present");
  });

  // The presenting round is the one place a viewer's set grows step by step, so
  // it is the one place a live stream can drift from a fresh snapshot. Every
  // move that can widen it appears here, including the two that can retract
  // rotation state (skip, re-draw) without ever retracting a card.
  it("present: a hand-off, a skip, a re-draw and a latecomer all converge", async () => {
    const { boardId, admin, ben, cara, notes } = await boardWith(["present"]);

    admin.socket.send({
      type: "admin.picker.pick",
      participantId: cara.you.id,
    });
    await ben.socket.waitForNext((e) => e.type === "notes.revealed");
    await expectConvergence(ben.socket, "member after one hand-off");

    admin.socket.send({ type: "admin.picker.skip" });
    await ben.socket.waitForNext((e) => e.type === "picker.changed");
    await expectConvergence(ben.socket, "member after a skip");

    // Same person again: nothing new to send, and nothing may be taken back.
    admin.socket.send({
      type: "admin.picker.pick",
      participantId: cara.you.id,
    });
    await ben.socket.waitForNext((e) => e.type === "picker.changed");
    await expectConvergence(ben.socket, "member after a re-draw");

    // The facilitator stacks across the boundary; Ben's copy arrives ungrouped
    // until the anchor's author takes the stage, and then it must be re-sent.
    admin.socket.send({
      type: "note.group",
      opId: opId(),
      noteId: notes.cara as string,
      targetNoteId: notes.anna as string,
    });
    await admin.socket.waitForNext(
      (e) => e.type === "note.updated" && e.note.id === notes.cara,
    );
    await expectConvergence(ben.socket, "member holding a split stack");
    admin.socket.send({
      type: "admin.picker.pick",
      participantId: admin.you.id,
    });
    await ben.socket.waitForNext((e) => e.type === "notes.revealed");
    await expectConvergence(ben.socket, "member once the anchor appears");

    const dan = await joined(boardId, "Dan");
    await expectConvergence(dan.socket, "latecomer mid-round");
    await expectConvergence(admin.socket, "facilitator mid-round");
  });

  it("vote: blind budgets and the anonymous meter", async () => {
    const { admin, ben, cara, notes } = await boardWith(["present", "vote"]);
    ben.socket.send({
      type: "vote.cast",
      opId: opId(),
      targetId: notes.cara as string,
      delta: 1,
    });
    await ben.socket.waitForNext((e) => e.type === "vote.progress");
    cara.socket.send({
      type: "vote.cast",
      opId: opId(),
      targetId: notes.anna as string,
      delta: 1,
    });
    await admin.socket.waitForNext((e) => e.type === "vote.meter");
    await expectConvergence(ben.socket, "member in vote");
    await expectConvergence(admin.socket, "facilitator in vote");
  });

  it("discuss: the tally reveal, synced focus and action items", async () => {
    const { admin, ben, notes } = await boardWith([
      "present",
      "vote",
      "discuss",
    ]);
    await ben.socket.waitForNext((e) => e.type === "votes.revealed");
    admin.socket.send({
      type: "admin.discuss.focus",
      targetId: notes.cara as string,
    });
    await ben.socket.waitForNext((e) => e.type === "discuss.focus");
    ben.socket.send({
      type: "action.create",
      opId: opId(),
      actionId: newId(),
      text: "Automate the deploy",
      ownerId: null,
    });
    await ben.socket.waitForNext((e) => e.type === "action.created");
    await expectConvergence(ben.socket, "member in discuss");
    await expectConvergence(admin.socket, "facilitator in discuss");
  });

  it("close and done: the appreciation wall and the released poll", async () => {
    const { admin, ben, cara } = await boardWith([
      "present",
      "vote",
      "discuss",
      "close",
    ]);
    ben.socket.send({
      type: "kudo.create",
      opId: opId(),
      kudoId: newId(),
      cardType: "great-job",
      toId: cara.you.id,
      text: "shipped the picker",
      anonymous: true,
    });
    await ben.socket.waitForNext((e) => e.type === "kudo.created");
    ben.socket.send({ type: "roti.set", score: 4 });
    await ben.socket.waitForNext((e) => e.type === "roti.you");
    await expectConvergence(ben.socket, "member in close");

    await toPhase(admin.socket, "done");
    await ben.socket.waitForNext(
      (e) => e.type === "roti.aggregate" && e.released,
    );
    await expectConvergence(ben.socket, "member in done");
  });

  it("a rewind converges too — the client must not keep what the server withdrew", async () => {
    // Rewinding re-hides foreign notes and re-blinds tallies server-side.
    // Anything the reducer fails to drop shows up here as a disagreement.
    const { admin, ben } = await boardWith(["present", "vote", "discuss"]);
    await ben.socket.waitForNext((e) => e.type === "votes.revealed");
    await toPhase(admin.socket, "write");
    await expectConvergence(ben.socket, "member after a rewind to write");
  });
});
