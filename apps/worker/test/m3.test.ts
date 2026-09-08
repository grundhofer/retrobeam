// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@retropolis/shared";
import { boardStub } from "../src/board-stub.js";
import { connect, createBoard, type TestSocket } from "./helpers.js";

let opCounter = 5000;
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

async function advanceTo(
  admin: { socket: TestSocket },
  phases: ReadonlyArray<"write" | "present" | "vote" | "discuss">,
): Promise<void> {
  for (const phase of phases) {
    admin.socket.send({ type: "admin.phase.set", phase });
    await admin.socket.waitForNext(
      (e) => e.type === "phase.changed" && e.phase === phase,
    );
  }
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

async function votingBoard() {
  const { boardId, adminToken } = await createBoard();
  const admin = await joined(boardId, "Anna", adminToken);
  const ben = await joined(boardId, "Ben");
  const columnId = admin.sync.columns[0]?.id;
  if (!columnId) throw new Error("setup");
  await advanceTo(admin, ["write"]);
  const noteA = await createNote(admin.socket, columnId, "Anna's point");
  const noteB = await createNote(ben.socket, columnId, "Ben's point");
  await advanceTo(admin, ["present", "vote"]);
  return { boardId, adminToken, admin, ben, columnId, noteA, noteB };
}

function cast(socket: TestSocket, targetId: string, delta: 1 | -1): void {
  socket.send({ type: "vote.cast", opId: opId(), targetId, delta });
}

// Votes are placed one dot at a time; send n consecutive +1 casts (processed
// in order by the DO).
function castMany(socket: TestSocket, targetId: string, n: number): void {
  for (let i = 0; i < n; i++) cast(socket, targetId, 1);
}

describe("blind voting", () => {
  it("a cast reaches the caster as vote.progress; others see ONLY the meter", async () => {
    const { admin, ben, noteA } = await votingBoard();

    cast(admin.socket, noteA, 1);
    const progress = await admin.socket.waitFor(
      (e) => e.type === "vote.progress" && e.yourVotes[noteA] === 1,
    );
    if (progress.type !== "vote.progress") throw new Error("unreachable");
    expect(progress.yourVotes[noteA]).toBe(1);

    // Ben receives a meter update but never a target id or a count of
    // someone else's vote.
    await ben.socket.waitFor((e) => e.type === "vote.meter");
    const benTraffic = ben.socket.events.filter(
      (e) =>
        e.type !== "sync" &&
        e.type !== "notes.revealed" &&
        e.type !== "note.created",
    );
    expect(JSON.stringify(benTraffic)).not.toContain(noteA);
  });

  it("sync during the vote phase carries no tallies and only own votes", async () => {
    const { admin, ben, noteA, noteB } = await votingBoard();
    cast(admin.socket, noteA, 1);
    await admin.socket.waitFor((e) => e.type === "vote.progress");
    cast(ben.socket, noteB, 1);
    await ben.socket.waitFor((e) => e.type === "vote.progress");

    ben.socket.send({ type: "resync" });
    const sync = await ben.socket.waitFor(
      (e) => e.type === "sync" && Object.keys(e.votes.mine).length > 0,
    );
    if (sync.type !== "sync") throw new Error("unreachable");
    expect(sync.votes.tallies).toBeNull();
    expect(sync.votes.voters).toBeNull();
    expect(sync.votes.mine).toEqual({ [noteB]: 1 });
    expect(JSON.stringify(sync.votes)).not.toContain(noteA);
  });

  it("budgets are enforced: per person and per target", async () => {
    const { admin, ben, noteA, noteB } = await votingBoard();
    admin.socket.send({
      type: "admin.vote.config",
      votesPerPerson: 2,
      maxPerTarget: 1,
      topN: 1,
    });
    await ben.socket.waitFor((e) => e.type === "config.changed");

    cast(ben.socket, noteA, 1);
    await ben.socket.waitFor((e) => e.type === "vote.progress");
    cast(ben.socket, noteA, 1); // exceeds maxPerTarget
    const capped = await ben.socket.waitForNext((e) => e.type === "reject");
    if (capped.type !== "reject") throw new Error("unreachable");
    expect(capped.code).toBe("VOTE_BUDGET");

    cast(ben.socket, noteB, 1);
    await ben.socket.waitFor(
      (e) => e.type === "vote.progress" && e.yourVotes[noteB] === 1,
    );
    cast(ben.socket, noteB, 1); // exceeds per-person budget AND per-target cap
    const spent = await ben.socket.waitFor(
      (e) => e.type === "reject" && e !== capped,
    );
    expect(spent.type).toBe("reject");

    // removing a vote frees budget again
    cast(ben.socket, noteA, -1);
    await ben.socket.waitFor(
      (e) => e.type === "vote.progress" && e.yourVotes[noteA] === undefined,
    );
  });

  it("the meter counts online participants who used their full budget", async () => {
    const { admin, ben, noteA, noteB } = await votingBoard();
    admin.socket.send({
      type: "admin.vote.config",
      votesPerPerson: 1,
      maxPerTarget: null,
      topN: 3,
    });
    await admin.socket.waitFor((e) => e.type === "config.changed");

    cast(admin.socket, noteB, 1);
    const meter1 = await ben.socket.waitFor(
      (e) => e.type === "vote.meter" && e.votersDone === 1,
    );
    if (meter1.type !== "vote.meter") throw new Error("unreachable");
    expect(meter1.votersTotal).toBe(2);

    cast(ben.socket, noteA, 1);
    await admin.socket.waitFor(
      (e) => e.type === "vote.meter" && e.votersDone === 2,
    );
  });

  it("voting outside the vote phase and on stacked notes is rejected", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    const columnId = admin.sync.columns[0]?.id;
    if (!columnId) throw new Error("setup");
    await advanceTo(admin, ["write"]);
    const noteA = await createNote(admin.socket, columnId, "one");
    const noteB = await createNote(admin.socket, columnId, "two");

    cast(admin.socket, noteA, 1); // still in write phase
    const locked = await admin.socket.waitForNext((e) => e.type === "reject");
    if (locked.type !== "reject") throw new Error("unreachable");
    expect(locked.code).toBe("PHASE_LOCKED");

    await advanceTo(admin, ["present"]);
    admin.socket.send({
      type: "note.group",
      opId: opId(),
      noteId: noteA,
      targetNoteId: noteB,
    });
    await admin.socket.waitFor(
      (e) =>
        e.type === "note.updated" &&
        e.note.id === noteA &&
        e.note.groupId !== null,
    );
    await advanceTo(admin, ["vote"]);

    cast(admin.socket, noteA, 1); // grouped note — vote the stack instead
    const grouped = await admin.socket.waitFor(
      (e) => e.type === "reject" && e.code === "INVALID",
    );
    expect(grouped.type).toBe("reject");

    cast(admin.socket, noteB, 1); // the stack's group id IS noteB's id
    await admin.socket.waitFor((e) => e.type === "vote.progress");
  });
});

// Naming voters is a deliberate, gated break of the blind-voting promise. Each
// gate gets its own test, because every one of them is the feature.
describe("voter names on the reveal", () => {
  it("a board created before the flag existed stays blind through the reveal", async () => {
    const { boardId, admin, ben, noteA } = await votingBoard();
    // Simulate a board persisted before the field: drop the meta row entirely.
    await runInDurableObject(boardStub(env, boardId), (_instance, state) => {
      state.storage.sql.exec(
        "DELETE FROM board_meta WHERE key = 'voterNamesEnabled'",
      );
    });
    castMany(admin.socket, noteA, 2);
    await admin.socket.waitFor((e) => e.type === "vote.progress");
    await advanceTo(admin, ["discuss"]);
    const revealed = await ben.socket.waitFor(
      (e) => e.type === "votes.revealed",
    );
    if (revealed.type !== "votes.revealed") throw new Error("unreachable");
    expect(revealed.voters).toBeNull();

    ben.socket.send({ type: "resync" });
    const sync = await ben.socket.waitFor(
      (e) => e.type === "sync" && e.phase === "discuss",
    );
    if (sync.type !== "sync") throw new Error("unreachable");
    expect(sync.votes.voters).toBeNull();
  });

  it("names each target's voters, and the sync agrees with the broadcast", async () => {
    const { admin, ben, noteA, noteB } = await votingBoard();
    castMany(admin.socket, noteA, 2);
    await admin.socket.waitFor(
      (e) => e.type === "vote.progress" && e.yourVotes[noteA] === 2,
    );
    cast(ben.socket, noteA, 1);
    await ben.socket.waitFor(
      (e) => e.type === "vote.progress" && e.yourVotes[noteA] === 1,
    );
    cast(ben.socket, noteB, 1);
    await ben.socket.waitFor(
      (e) => e.type === "vote.progress" && e.yourVotes[noteB] === 1,
    );

    // Nothing leaks WHILE voting: the map is a property of the reveal.
    ben.socket.send({ type: "resync" });
    const midVote = await ben.socket.waitFor(
      (e) => e.type === "sync" && e.phase === "vote",
    );
    if (midVote.type !== "sync") throw new Error("unreachable");
    expect(midVote.votes.voters).toBeNull();

    await advanceTo(admin, ["discuss"]);
    const revealed = await ben.socket.waitFor(
      (e) => e.type === "votes.revealed",
    );
    if (revealed.type !== "votes.revealed") throw new Error("unreachable");
    expect(revealed.voters).toEqual({
      [noteA]: { [admin.you.id]: 2, [ben.you.id]: 1 },
      [noteB]: { [ben.you.id]: 1 },
    });
    // The invariant that makes the map trustworthy: it is the SAME data the
    // tally is summed from, not a second source that can drift.
    for (const [targetId, spent] of Object.entries(revealed.voters ?? {})) {
      const total = Object.values(spent).reduce((sum, n) => sum + n, 0);
      expect(total).toBe(revealed.tallies[targetId]);
    }

    ben.socket.send({ type: "resync" });
    const sync = await ben.socket.waitFor(
      (e) => e.type === "sync" && e.phase === "discuss",
    );
    if (sync.type !== "sync") throw new Error("unreachable");
    expect(sync.votes.voters).toEqual(revealed.voters);
  });

  it("a note in a staged column never appears in the voter map", async () => {
    const { admin, ben, columnId, noteA } = await votingBoard();
    castMany(admin.socket, noteA, 2);
    await admin.socket.waitFor((e) => e.type === "vote.progress");
    admin.socket.send({
      type: "admin.column.setHidden",
      opId: opId(),
      columnId,
      hidden: true,
    });
    await admin.socket.waitFor((e) => e.type === "column.updated");

    await advanceTo(admin, ["discuss"]);
    // The reveal is broadcast to EVERYONE, so a staged note's id must be
    // absent from the voter map for the facilitator too — not merely filtered
    // per recipient.
    const revealed = await admin.socket.waitFor(
      (e) => e.type === "votes.revealed",
    );
    if (revealed.type !== "votes.revealed") throw new Error("unreachable");
    expect(revealed.voters).toEqual({});
    expect(JSON.stringify(revealed)).not.toContain(noteA);
    expect(ben.socket.events.some((e) => e.type === "votes.revealed")).toBe(
      true,
    );
  });

  it("turning names off during discuss withdraws them without a resync", async () => {
    const { admin, ben, noteA } = await votingBoard();
    cast(admin.socket, noteA, 1);
    await admin.socket.waitFor((e) => e.type === "vote.progress");
    await advanceTo(admin, ["discuss"]);
    const named = await ben.socket.waitFor((e) => e.type === "votes.revealed");
    if (named.type !== "votes.revealed") throw new Error("unreachable");
    expect(named.voters).not.toBeNull();

    // The lock is one-way: it refuses de-blinding, never withdrawal.
    admin.socket.send({ type: "admin.voterNames.set", enabled: false });
    const withdrawn = await ben.socket.waitForNext(
      (e) => e.type === "votes.revealed",
    );
    if (withdrawn.type !== "votes.revealed") throw new Error("unreachable");
    // Names come down on every screen without anyone reloading, and the
    // tallies stay — only the attribution is taken back.
    expect(withdrawn.voters).toBeNull();
    expect(withdrawn.tallies[noteA]).toBe(1);
  });

  it("the flag is locked once voting has closed", async () => {
    const { admin } = await votingBoard();
    await advanceTo(admin, ["discuss"]);
    admin.socket.send({ type: "admin.voterNames.set", enabled: true });
    const refused = await admin.socket.waitForNext((e) => e.type === "reject");
    if (refused.type !== "reject") throw new Error("unreachable");
    expect(refused.code).toBe("PHASE_LOCKED");
  });

  it("the flag is locked as soon as the FIRST dot is cast, not at the reveal", async () => {
    const { admin, noteA } = await votingBoard();
    // Before anyone votes it is a normal setting.
    admin.socket.send({ type: "admin.voterNames.set", enabled: false });
    await admin.socket.waitFor(
      (e) => e.type === "config.changed" && !e.config.voterNamesEnabled,
    );

    cast(admin.socket, noteA, 1);
    await admin.socket.waitFor((e) => e.type === "vote.progress");

    // Now it is not: that dot was cast under "no names are shown", and there
    // is no way for the voter to take it back.
    admin.socket.send({ type: "admin.voterNames.set", enabled: true });
    const refused = await admin.socket.waitForNext((e) => e.type === "reject");
    if (refused.type !== "reject") throw new Error("unreachable");
    expect(refused.code).toBe("PHASE_LOCKED");

    // Turning them OFF stays allowed — withdrawal is always safe.
    admin.socket.send({ type: "admin.voterNames.set", enabled: false });
    await admin.socket.waitFor(
      (e) => e.type === "config.changed" && !e.config.voterNamesEnabled,
    );
  });

  it("an anonymous board never attributes a vote, flag or no flag", async () => {
    const { boardId, admin, ben, noteA } = await votingBoard();
    // Anonymity is not reachable from the UI yet, so force both rows: the
    // point is that the FLAG cannot win against it.
    await runInDurableObject(boardStub(env, boardId), (_instance, state) => {
      state.storage.sql.exec(
        "INSERT INTO board_meta (key, value) VALUES ('anonymous', '1') ON CONFLICT(key) DO UPDATE SET value = '1'",
      );
    });
    admin.socket.send({ type: "admin.voterNames.set", enabled: true });
    const refused = await admin.socket.waitForNext((e) => e.type === "reject");
    if (refused.type !== "reject") throw new Error("unreachable");
    expect(refused.code).toBe("INVALID");

    cast(admin.socket, noteA, 1);
    await admin.socket.waitFor((e) => e.type === "vote.progress");
    await advanceTo(admin, ["discuss"]);
    const revealed = await ben.socket.waitFor(
      (e) => e.type === "votes.revealed",
    );
    if (revealed.type !== "votes.revealed") throw new Error("unreachable");
    // Belt and braces: the stored flag is still "1" from initialize(), and
    // voterNamesShown() is what refuses to honour it.
    expect(revealed.voters).toBeNull();
  });
});

describe("reveal & discussion", () => {
  it("vote→discuss reveals tallies and crowns the top-N with a stable tiebreak", async () => {
    const { admin, ben, noteA, noteB } = await votingBoard();
    admin.socket.send({
      type: "admin.vote.config",
      votesPerPerson: 3,
      maxPerTarget: null,
      topN: 1,
    });
    await admin.socket.waitFor((e) => e.type === "config.changed");

    cast(admin.socket, noteB, 1);
    await admin.socket.waitFor((e) => e.type === "vote.progress");
    cast(admin.socket, noteB, 1);
    await admin.socket.waitFor(
      (e) => e.type === "vote.progress" && e.yourVotes[noteB] === 2,
    );
    cast(ben.socket, noteA, 1);
    await ben.socket.waitFor((e) => e.type === "vote.progress");

    await advanceTo(admin, ["discuss"]);
    const revealed = await ben.socket.waitFor(
      (e) => e.type === "votes.revealed",
    );
    if (revealed.type !== "votes.revealed") throw new Error("unreachable");
    expect(revealed.tallies).toEqual({ [noteB]: 2, [noteA]: 1 });
    expect(revealed.topTargetIds).toEqual([noteB]);
  });

  it("rewinding to vote hides tallies in fresh snapshots again", async () => {
    const { admin, ben, noteA } = await votingBoard();
    cast(admin.socket, noteA, 1);
    await admin.socket.waitFor((e) => e.type === "vote.progress");
    await advanceTo(admin, ["discuss"]);
    await ben.socket.waitFor((e) => e.type === "votes.revealed");

    admin.socket.send({ type: "admin.phase.set", phase: "vote" });
    await ben.socket.waitFor(
      (e) => e.type === "phase.changed" && e.phase === "vote",
    );
    ben.socket.send({ type: "resync" });
    const sync = await ben.socket.waitFor(
      (e) => e.type === "sync" && e.phase === "vote",
    );
    if (sync.type !== "sync") throw new Error("unreachable");
    expect(sync.votes.tallies).toBeNull();
    expect(sync.votes.topTargetIds).toEqual([]);
  });

  it("discussion focus is admin-only, discuss-phase-only, and synced", async () => {
    const { admin, ben, noteA } = await votingBoard();
    admin.socket.send({ type: "admin.discuss.focus", targetId: noteA });
    const locked = await admin.socket.waitForNext((e) => e.type === "reject");
    if (locked.type !== "reject") throw new Error("unreachable");
    expect(locked.code).toBe("PHASE_LOCKED");

    await advanceTo(admin, ["discuss"]);
    ben.socket.send({ type: "admin.discuss.focus", targetId: noteA });
    const notAdmin = await ben.socket.waitFor(
      (e) => e.type === "reject" && e.code === "NOT_ADMIN",
    );
    expect(notAdmin.type).toBe("reject");

    admin.socket.send({ type: "admin.discuss.focus", targetId: noteA });
    const focus = await ben.socket.waitFor((e) => e.type === "discuss.focus");
    if (focus.type !== "discuss.focus") throw new Error("unreachable");
    expect(focus.targetId).toBe(noteA);

    // focus lands in snapshots and clears on phase change
    ben.socket.send({ type: "resync" });
    const sync = await ben.socket.waitFor(
      (e) => e.type === "sync" && e.discussFocusId === noteA,
    );
    expect(sync.type).toBe("sync");
    admin.socket.send({ type: "admin.phase.set", phase: "vote" });
    await ben.socket.waitFor(
      (e) => e.type === "phase.changed" && e.phase === "vote",
    );
    ben.socket.send({ type: "resync" });
    const cleared = await ben.socket.waitFor(
      (e) => e.type === "sync" && e.phase === "vote",
    );
    if (cleared.type !== "sync") throw new Error("unreachable");
    expect(cleared.discussFocusId).toBeNull();
  });

  it("grouping is locked once voting starts", async () => {
    const { admin, noteA, noteB } = await votingBoard();
    admin.socket.send({
      type: "note.group",
      opId: opId(),
      noteId: noteA,
      targetNoteId: noteB,
    });
    const locked = await admin.socket.waitForNext((e) => e.type === "reject");
    if (locked.type !== "reject") throw new Error("unreachable");
    expect(locked.code).toBe("PHASE_LOCKED");
  });
});

describe("vote migration through stack changes", () => {
  it("votes follow a note into a stack and survive dissolution", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    const columnId = admin.sync.columns[0]?.id;
    if (!columnId) throw new Error("setup");
    await advanceTo(admin, ["write"]);
    const noteA = await createNote(admin.socket, columnId, "target");
    const noteB = await createNote(admin.socket, columnId, "joins later");
    await advanceTo(admin, ["present", "vote"]);

    cast(admin.socket, noteB, 1);
    await admin.socket.waitFor((e) => e.type === "vote.progress");

    // Rewind to present, stack B onto A: B's vote must follow into the stack.
    admin.socket.send({ type: "admin.phase.set", phase: "present" });
    await admin.socket.waitFor(
      (e) => e.type === "phase.changed" && e.phase === "present",
    );
    admin.socket.send({
      type: "note.group",
      opId: opId(),
      noteId: noteB,
      targetNoteId: noteA,
    });
    await admin.socket.waitFor(
      (e) =>
        e.type === "note.updated" &&
        e.note.id === noteB &&
        e.note.groupId === noteA,
    );

    await advanceTo(admin, ["vote", "discuss"]);
    const revealed = await admin.socket.waitFor(
      (e) => e.type === "votes.revealed",
    );
    if (revealed.type !== "votes.revealed") throw new Error("unreachable");
    expect(revealed.tallies[noteA]).toBe(1); // stack id = noteA
  });

  it("moving a stack's anchor elsewhere leaves the stack's votes with the stack", async () => {
    // A stack is identified by its anchor's note id, so the anchor's own id is
    // also the stack's vote bucket. Dragging that anchor onto a third note used
    // to migrate the WHOLE stack's votes to the destination, zeroing the
    // survivors and crowning a card nobody voted for.
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    const columnId = admin.sync.columns[0]?.id;
    if (!columnId) throw new Error("setup");
    await advanceTo(admin, ["write"]);
    const anchor = await createNote(admin.socket, columnId, "anchor");
    const member = await createNote(admin.socket, columnId, "member");
    const outsider = await createNote(admin.socket, columnId, "outsider");
    await advanceTo(admin, ["present"]);

    // Stack `member` onto `anchor` → stack id === anchor.
    admin.socket.send({
      type: "note.group",
      opId: opId(),
      noteId: member,
      targetNoteId: anchor,
    });
    await admin.socket.waitFor(
      (e) =>
        e.type === "note.updated" &&
        e.note.id === member &&
        e.note.groupId === anchor,
    );

    // Three dots on the stack.
    await advanceTo(admin, ["vote"]);
    castMany(admin.socket, anchor, 3);
    await admin.socket.waitFor(
      (e) => e.type === "vote.progress" && e.yourVotes[anchor] === 3,
    );

    // Rewind and drag the anchor out of its own stack, onto the outsider.
    admin.socket.send({ type: "admin.phase.set", phase: "present" });
    await admin.socket.waitFor(
      (e) => e.type === "phase.changed" && e.phase === "present",
    );
    admin.socket.send({
      type: "note.group",
      opId: opId(),
      noteId: anchor,
      targetNoteId: outsider,
    });
    await admin.socket.waitFor(
      (e) =>
        e.type === "note.updated" &&
        e.note.id === anchor &&
        e.note.groupId === outsider,
    );

    await advanceTo(admin, ["vote", "discuss"]);
    const revealed = await admin.socket.waitFor(
      (e) => e.type === "votes.revealed",
    );
    if (revealed.type !== "votes.revealed") throw new Error("unreachable");
    // `member` is alone now, so the old stack dissolved onto it and kept the
    // three dots. The outsider's new stack was never voted for.
    expect(revealed.tallies[member]).toBe(3);
    expect(revealed.tallies[outsider] ?? 0).toBe(0);
    expect(revealed.topTargetIds[0]).toBe(member);
  });
});

describe("review-fleet regressions", () => {
  it("deleting a stack anchor migrates its votes instead of destroying them", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    const columnId = admin.sync.columns[0]?.id;
    if (!columnId) throw new Error("setup");
    await advanceTo(admin, ["write"]);
    const noteA = await createNote(admin.socket, columnId, "anchor");
    const noteB = await createNote(admin.socket, columnId, "member");
    await advanceTo(admin, ["present"]);
    // Group B onto A → A is the anchor, stack id = A.
    admin.socket.send({
      type: "note.group",
      opId: opId(),
      noteId: noteB,
      targetNoteId: noteA,
    });
    await admin.socket.waitFor(
      (e) =>
        e.type === "note.updated" &&
        e.note.id === noteB &&
        e.note.groupId === noteA,
    );
    await advanceTo(admin, ["vote"]);
    castMany(admin.socket, noteA, 2); // vote the STACK (id = A)
    await admin.socket.waitFor(
      (e) => e.type === "vote.progress" && e.yourVotes[noteA] === 2,
    );

    // Delete the anchor A during vote: votes must survive on the survivor B.
    admin.socket.send({ type: "admin.phase.set", phase: "present" });
    await admin.socket.waitFor(
      (e) => e.type === "phase.changed" && e.phase === "present",
    );
    admin.socket.send({ type: "note.delete", opId: opId(), noteId: noteA });
    await admin.socket.waitFor((e) => e.type === "ack" && e.seq > 0);
    await advanceTo(admin, ["vote", "discuss"]);
    const revealed = await admin.socket.waitFor(
      (e) => e.type === "votes.revealed",
    );
    if (revealed.type !== "votes.revealed") throw new Error("unreachable");
    // B is now a lone note carrying the migrated votes.
    expect(revealed.tallies[noteB]).toBe(2);
  });

  it("deleting a voted note during vote frees the voter's budget on their client", async () => {
    const { admin, ben, noteA } = await votingBoard();
    castMany(ben.socket, noteA, 3); // Ben spends his whole budget on Anna's note
    await ben.socket.waitFor(
      (e) => e.type === "vote.progress" && e.yourVotes[noteA] === 3,
    );

    admin.socket.send({ type: "note.delete", opId: opId(), noteId: noteA });
    // Ben's client is told his votes are gone (budget freed) without a reload.
    const freed = await ben.socket.waitFor(
      (e) => e.type === "vote.progress" && e.yourVotes[noteA] === undefined,
    );
    if (freed.type !== "vote.progress") throw new Error("unreachable");
    expect(Object.keys(freed.yourVotes)).toHaveLength(0);
  });

  it("deleting the focused card during discuss clears the dangling focus and re-reveals", async () => {
    const { admin, noteA, noteB } = await votingBoard();
    cast(admin.socket, noteA, 1);
    await admin.socket.waitFor(
      (e) => e.type === "vote.progress" && e.yourVotes[noteA] === 1,
    );
    await advanceTo(admin, ["discuss"]);
    admin.socket.send({ type: "admin.discuss.focus", targetId: noteA });
    await admin.socket.waitFor(
      (e) => e.type === "discuss.focus" && e.targetId === noteA,
    );

    admin.socket.send({ type: "note.delete", opId: opId(), noteId: noteA });
    const cleared = await admin.socket.waitFor(
      (e) => e.type === "discuss.focus" && e.targetId === null,
    );
    expect(cleared.type).toBe("discuss.focus");
    const rerevealed = await admin.socket.waitFor(
      (e) => e.type === "votes.revealed" && e.tallies[noteA] === undefined,
    );
    if (rerevealed.type !== "votes.revealed") throw new Error("unreachable");
    expect(rerevealed.topTargetIds).not.toContain(noteA);
    void noteB;
  });

  it("focus rejects a buried stacked-note id", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    const columnId = admin.sync.columns[0]?.id;
    if (!columnId) throw new Error("setup");
    await advanceTo(admin, ["write"]);
    const noteA = await createNote(admin.socket, columnId, "anchor");
    const noteB = await createNote(admin.socket, columnId, "member");
    await advanceTo(admin, ["present"]);
    admin.socket.send({
      type: "note.group",
      opId: opId(),
      noteId: noteB,
      targetNoteId: noteA,
    });
    await admin.socket.waitFor(
      (e) =>
        e.type === "note.updated" &&
        e.note.id === noteB &&
        e.note.groupId === noteA,
    );
    await advanceTo(admin, ["vote", "discuss"]);
    admin.socket.send({ type: "admin.discuss.focus", targetId: noteB }); // buried member
    const rejected = await admin.socket.waitForNext((e) => e.type === "reject");
    if (rejected.type !== "reject") throw new Error("unreachable");
    expect(rejected.code).toBe("NOT_FOUND");
  });

  it("lowering the budget mid-vote clamps existing over-budget votes", async () => {
    const { admin, ben, noteA, noteB } = await votingBoard();
    castMany(admin.socket, noteA, 2);
    cast(admin.socket, noteB, 1);
    await admin.socket.waitFor(
      (e) => e.type === "vote.progress" && e.yourVotes[noteB] === 1,
    );
    // Drop the budget from 3 to 1: Anna's 3 cast votes must trim to 1 total.
    admin.socket.send({
      type: "admin.vote.config",
      votesPerPerson: 1,
      maxPerTarget: null,
      topN: 3,
    });
    const clamped = await admin.socket.waitFor(
      (e) =>
        e.type === "vote.progress" &&
        Object.values(e.yourVotes).reduce((s, n) => s + n, 0) === 1,
    );
    if (clamped.type !== "vote.progress") throw new Error("unreachable");
    const total = Object.values(clamped.yourVotes).reduce((s, n) => s + n, 0);
    expect(total).toBe(1);
    void ben;
  });

  it("a merge cannot push a voter above maxPerTarget", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    const columnId = admin.sync.columns[0]?.id;
    if (!columnId) throw new Error("setup");
    await advanceTo(admin, ["write"]);
    const noteA = await createNote(admin.socket, columnId, "A");
    const noteB = await createNote(admin.socket, columnId, "B");
    await advanceTo(admin, ["present", "vote"]);
    admin.socket.send({
      type: "admin.vote.config",
      votesPerPerson: 5,
      maxPerTarget: 2,
      topN: 3,
    });
    await admin.socket.waitFor((e) => e.type === "config.changed");
    castMany(admin.socket, noteA, 2);
    castMany(admin.socket, noteB, 2);
    await admin.socket.waitFor(
      (e) => e.type === "vote.progress" && e.yourVotes[noteB] === 2,
    );

    // Rewind, merge A onto B → 2+2 would be 4 on the stack; must clamp to 2.
    admin.socket.send({ type: "admin.phase.set", phase: "present" });
    await admin.socket.waitFor(
      (e) => e.type === "phase.changed" && e.phase === "present",
    );
    admin.socket.send({
      type: "note.group",
      opId: opId(),
      noteId: noteA,
      targetNoteId: noteB,
    });
    await admin.socket.waitFor(
      (e) =>
        e.type === "note.updated" &&
        e.note.id === noteA &&
        e.note.groupId === noteB,
    );
    await advanceTo(admin, ["vote", "discuss"]);
    const revealed = await admin.socket.waitFor(
      (e) => e.type === "votes.revealed",
    );
    if (revealed.type !== "votes.revealed") throw new Error("unreachable");
    expect(revealed.tallies[noteB]).toBe(2); // clamped, not 4
  });
});

describe("action items", () => {
  it("full lifecycle during discuss, locked elsewhere", async () => {
    const { admin, ben } = await votingBoard();
    const actionId = newId();

    admin.socket.send({
      type: "action.create",
      opId: opId(),
      actionId,
      text: "Fix the pipeline",
      ownerId: ben.you.id,
    });
    const locked = await admin.socket.waitForNext((e) => e.type === "reject");
    if (locked.type !== "reject") throw new Error("unreachable");
    expect(locked.code).toBe("PHASE_LOCKED");

    await advanceTo(admin, ["discuss"]);
    admin.socket.send({
      type: "action.create",
      opId: opId(),
      actionId,
      text: "Fix the pipeline",
      ownerId: ben.you.id,
    });
    const created = await ben.socket.waitFor(
      (e) => e.type === "action.created",
    );
    if (created.type !== "action.created") throw new Error("unreachable");
    expect(created.action).toMatchObject({
      text: "Fix the pipeline",
      ownerId: ben.you.id,
      status: "open",
    });

    ben.socket.send({
      type: "action.update",
      opId: opId(),
      actionId,
      status: "done",
    });
    const updated = await admin.socket.waitFor(
      (e) => e.type === "action.updated",
    );
    if (updated.type !== "action.updated") throw new Error("unreachable");
    expect(updated.action.status).toBe("done");
    expect(updated.action.text).toBe("Fix the pipeline"); // partial update keeps the rest

    ben.socket.send({ type: "action.delete", opId: opId(), actionId });
    await admin.socket.waitFor((e) => e.type === "action.deleted");
  });
});
