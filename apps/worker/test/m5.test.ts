// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { ICEBREAKER_IDS, type ServerEvent } from "@retrobeam/shared";
import { connect, createBoard, type TestSocket } from "./helpers.js";

let opCounter = 12000;
function opId(): string {
  return (opCounter++).toString(16).padStart(32, "0");
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

async function toClose(admin: { socket: TestSocket }) {
  for (const p of ["write", "present", "vote", "discuss", "close"]) {
    await toPhase(admin.socket, p);
  }
}

describe("check-in", () => {
  it("lets the facilitator prepare the icebreaker before entering check-in", async () => {
    // Check-in is off by default; opt in so the phase is reachable.
    const { boardId, adminToken } = await createBoard("Sprint 12", {
      checkin: true,
    });
    const admin = await joined(boardId, "Anna", adminToken);
    const ben = await joined(boardId, "Ben");

    admin.socket.send({ type: "admin.checkin.shuffle" });
    const shuffled = await ben.socket.waitForNext(
      (e) => e.type === "checkin.shuffled",
    );
    if (shuffled.type !== "checkin.shuffled") throw new Error("unreachable");
    const first = shuffled.icebreakerId;
    expect(ICEBREAKER_IDS).toContain(first);

    admin.socket.send({
      type: "admin.checkin.question.set",
      icebreakerId: "weather",
    });
    const selected = await ben.socket.waitForNext(
      (e) => e.type === "checkin.question.changed",
    );
    if (selected.type !== "checkin.question.changed")
      throw new Error("unreachable");
    expect(selected.icebreakerId).toBe("weather");

    // Ben's fresh sync carries the prepared question (persisted).
    ben.socket.send({ type: "resync" });
    const sync = await ben.socket.waitFor(
      (e) => e.type === "sync" && e.icebreakerId !== null,
    );
    if (sync.type !== "sync") throw new Error("unreachable");
    expect(sync.icebreakerId).toBe("weather");

    await toPhase(admin.socket, "checkin");
    // The live screen is presentation-only; changing its question is refused.
    admin.socket.send({ type: "admin.checkin.shuffle" });
    const locked = await admin.socket.waitForNext((e) => e.type === "reject");
    if (locked.type !== "reject") throw new Error("unreachable");
    expect(locked.code).toBe("PHASE_LOCKED");
  });

  it("only the facilitator configures the check-in, and only before start", async () => {
    const { boardId, adminToken } = await createBoard("Sprint 12", {
      checkin: true,
    });
    const admin = await joined(boardId, "Anna", adminToken);
    const ben = await joined(boardId, "Ben");
    ben.socket.send({ type: "admin.checkin.shuffle" });
    const notAdmin = await ben.socket.waitForNext((e) => e.type === "reject");
    if (notAdmin.type !== "reject") throw new Error("unreachable");
    expect(notAdmin.code).toBe("NOT_ADMIN");

    ben.socket.send({
      type: "admin.checkin.question.set",
      icebreakerId: "weather",
    });
    const selectForbidden = await ben.socket.waitForNext(
      (e) => e.type === "reject",
    );
    if (selectForbidden.type !== "reject") throw new Error("unreachable");
    expect(selectForbidden.code).toBe("NOT_ADMIN");

    await toPhase(admin.socket, "checkin");
    admin.socket.send({
      type: "admin.checkin.question.set",
      icebreakerId: "weather",
    });
    const locked = await admin.socket.waitForNext((e) => e.type === "reject");
    if (locked.type !== "reject") throw new Error("unreachable");
    expect(locked.code).toBe("PHASE_LOCKED");
  });

  it("the facilitator edits working agreements; everyone sees it, and it persists", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    const ben = await joined(boardId, "Ben");

    admin.socket.send({
      type: "admin.agreements.set",
      text: "Vegas rule. Be kind.",
    });
    const changed = await ben.socket.waitFor(
      (e) => e.type === "agreements.changed",
    );
    if (changed.type !== "agreements.changed") throw new Error("unreachable");
    expect(changed.text).toBe("Vegas rule. Be kind.");

    const cara = await joined(boardId, "Cara");
    expect(cara.sync.workingAgreements).toBe("Vegas rule. Be kind.");

    await toPhase(admin.socket, "write");
    admin.socket.send({
      type: "admin.agreements.set",
      text: "Too late",
    });
    const locked = await admin.socket.waitForNext((e) => e.type === "reject");
    if (locked.type !== "reject") throw new Error("unreachable");
    expect(locked.code).toBe("PHASE_LOCKED");

    // Members can't edit.
    ben.socket.send({ type: "admin.agreements.set", text: "hacked" });
    const rejected = await ben.socket.waitForNext((e) => e.type === "reject");
    if (rejected.type !== "reject") throw new Error("unreachable");
    expect(rejected.code).toBe("NOT_ADMIN");
  });
});

describe("retro phase plan", () => {
  it("lets the facilitator configure optional phases in the lobby and syncs the plan", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    const ben = await joined(boardId, "Ben");
    const phasePlan = {
      checkin: true,
      vote: false,
      discuss: true,
      close: false,
    };

    admin.socket.send({ type: "admin.phasePlan.set", phasePlan });
    const changed = await ben.socket.waitForNext(
      (event) =>
        event.type === "config.changed" &&
        event.config.phasePlan.close === false,
    );
    if (changed.type !== "config.changed") throw new Error("unreachable");
    expect(changed.config.phasePlan).toEqual(phasePlan);
    expect(changed.config.phasePlanLocked).toBe(false);

    const cara = await joined(boardId, "Cara");
    expect(cara.sync.config.phasePlan).toEqual(phasePlan);
  });

  it("refuses members and locks the plan permanently on the first start", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    const ben = await joined(boardId, "Ben");
    const phasePlan = {
      checkin: false,
      vote: false,
      discuss: false,
      close: false,
    };

    ben.socket.send({ type: "admin.phasePlan.set", phasePlan });
    const forbidden = await ben.socket.waitForNext(
      (event) => event.type === "reject",
    );
    if (forbidden.type !== "reject") throw new Error("unreachable");
    expect(forbidden.code).toBe("NOT_ADMIN");

    admin.socket.send({ type: "admin.phasePlan.set", phasePlan });
    await admin.socket.waitForNext(
      (event) =>
        event.type === "config.changed" &&
        event.config.phasePlan.vote === false,
    );
    await toPhase(admin.socket, "write");
    await toPhase(admin.socket, "lobby");

    admin.socket.send({
      type: "admin.phasePlan.set",
      phasePlan: { ...phasePlan, vote: true },
    });
    const locked = await admin.socket.waitForNext(
      (event) => event.type === "reject",
    );
    if (locked.type !== "reject") throw new Error("unreachable");
    expect(locked.code).toBe("PHASE_LOCKED");

    admin.socket.send({ type: "resync" });
    const sync = await admin.socket.waitForNext(
      (event) => event.type === "sync",
    );
    if (sync.type !== "sync") throw new Error("unreachable");
    expect(sync.config.phasePlanLocked).toBe(true);
  });

  it("walks directly to done when every optional phase is disabled", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    admin.socket.send({
      type: "admin.phasePlan.set",
      phasePlan: {
        checkin: false,
        vote: false,
        discuss: false,
        close: false,
      },
    });
    await admin.socket.waitForNext(
      (event) =>
        event.type === "config.changed" &&
        event.config.phasePlan.close === false,
    );

    await toPhase(admin.socket, "write");
    await toPhase(admin.socket, "present");
    await toPhase(admin.socket, "done");
  });

  it("reveals vote results when discussion is skipped", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    admin.socket.send({
      type: "admin.phasePlan.set",
      phasePlan: {
        checkin: false,
        vote: true,
        discuss: false,
        close: true,
      },
    });
    await admin.socket.waitForNext(
      (event) =>
        event.type === "config.changed" &&
        event.config.phasePlan.discuss === false,
    );
    await toPhase(admin.socket, "write");
    await toPhase(admin.socket, "present");
    await toPhase(admin.socket, "vote");

    const from = admin.socket.events.length;
    admin.socket.send({ type: "admin.phase.set", phase: "close" });
    await admin.socket.waitFor(
      (event, index) => index >= from && event.type === "votes.revealed",
    );
    expect(
      admin.socket.events.some(
        (event, index) =>
          index >= from &&
          event.type === "phase.changed" &&
          event.phase === "close",
      ),
    ).toBe(true);
  });
});

describe("ROTI closing poll", () => {
  it("does not publish the result when the facilitator rewinds from close", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    await toClose(admin);
    admin.socket.send({ type: "roti.set", score: 5 });
    await admin.socket.waitForNext((event) => event.type === "roti.you");

    await toPhase(admin.socket, "discuss");
    admin.socket.send({ type: "resync" });
    const sync = await admin.socket.waitForNext(
      (event) => event.type === "sync",
    );
    if (sync.type !== "sync") throw new Error("unreachable");
    expect(sync.roti.released).toBe(false);
  });

  it("publishes the average ONCE at the end, never as a running mean", async () => {
    // A running mean re-broadcast per submission is differenceable: an observer
    // holding two consecutive aggregates computes n*avg(n) - (n-1)*avg(n-1) and
    // recovers that respondent's exact 1-5 score. So while the poll is open,
    // only the COUNT may move.
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    const ben = await joined(boardId, "Ben");
    const cara = await joined(boardId, "Cara");
    await toClose(admin);

    admin.socket.send({ type: "roti.set", score: 5 });
    const you = await admin.socket.waitFor((e) => e.type === "roti.you");
    if (you.type !== "roti.you") throw new Error("unreachable");
    expect(you.yourScore).toBe(5);
    // The caster's own score is private to their own sockets.
    expect(ben.socket.events.some((e) => e.type === "roti.you")).toBe(false);

    ben.socket.send({ type: "roti.set", score: 3 });
    await admin.socket.waitFor(
      (e) => e.type === "roti.aggregate" && e.count === 2,
    );
    cara.socket.send({ type: "roti.set", score: 4 });
    await admin.socket.waitFor(
      (e) => e.type === "roti.aggregate" && e.count === 3,
    );
    // Re-scoring is the sharpest case: the count holds still while a running
    // mean would move, publishing the delta outright.
    admin.socket.send({ type: "roti.set", score: 1 });
    await admin.socket.waitFor(
      (e) => e.type === "roti.you" && e.yourScore === 1,
    );

    // NOT ONE aggregate broadcast during the open poll carried an average, and
    // none claimed to be released.
    const openAggregates = admin.socket.events.filter(
      (e) => e.type === "roti.aggregate",
    );
    expect(openAggregates.length).toBeGreaterThanOrEqual(3);
    for (const agg of openAggregates) {
      if (agg.type !== "roti.aggregate") throw new Error("unreachable");
      expect(agg.average).toBeNull();
      expect(agg.released).toBe(false);
    }
    // …and a mid-poll joiner cannot read one out of a snapshot either.
    const dan = await joined(boardId, "Dan");
    expect(dan.sync.roti.count).toBe(3);
    expect(dan.sync.roti.average).toBeNull();
    expect(dan.sync.roti.released).toBe(false);
    expect(dan.sync.roti.yourScore).toBeNull();

    // Leaving the closing phase publishes the result, exactly once.
    await toPhase(admin.socket, "done");
    const released = await ben.socket.waitFor(
      (e) => e.type === "roti.aggregate" && e.released,
    );
    if (released.type !== "roti.aggregate") throw new Error("unreachable");
    expect(released.count).toBe(3);
    expect(released.average).toBe(2.7); // (1 + 3 + 4) / 3

    // The poll is closed for good — a second release could be differenced
    // against the first.
    ben.socket.send({ type: "roti.set", score: 5 });
    const refused = await ben.socket.waitForNext((e) => e.type === "reject");
    if (refused.type !== "reject") throw new Error("unreachable");
    expect(refused.code).toBe("PHASE_LOCKED");

    // The published figures are frozen: every later read is identical.
    ben.socket.send({ type: "resync" });
    const resynced = await ben.socket.waitFor(
      (e) => e.type === "sync" && e.roti.released,
    );
    if (resynced.type !== "sync") throw new Error("unreachable");
    expect(resynced.roti.count).toBe(3);
    expect(resynced.roti.average).toBe(2.7);
  });

  it("withholds the average at release when too few people answered", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    const ben = await joined(boardId, "Ben");
    await toClose(admin);

    admin.socket.send({ type: "roti.set", score: 5 });
    await admin.socket.waitFor((e) => e.type === "roti.you");
    ben.socket.send({ type: "roti.set", score: 1 });
    await admin.socket.waitFor(
      (e) => e.type === "roti.aggregate" && e.count === 2,
    );

    await toPhase(admin.socket, "done");
    const released = await ben.socket.waitFor(
      (e) => e.type === "roti.aggregate" && e.released,
    );
    if (released.type !== "roti.aggregate") throw new Error("unreachable");
    expect(released.count).toBe(2);
    // With two respondents a co-voter subtracts their own to recover the other.
    expect(released.average).toBeNull();
  });

  it("sends the caster's own score to every one of their sockets", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    await toClose(admin);

    // Anna opens a second tab: same identity, reclaimed via her session key.
    const tab2 = await connect(boardId);
    tab2.send({ type: "join", name: "Anna", sessionKey: admin.you.sessionKey });
    await tab2.waitFor((e) => e.type === "sync");

    // She rates on tab 1 → BOTH of her tabs learn her own score (no stale
    // selection on the projector view), and neither leaks to anyone else.
    admin.socket.send({ type: "roti.set", score: 4 });
    const you1 = await admin.socket.waitFor((e) => e.type === "roti.you");
    const you2 = await tab2.waitFor((e) => e.type === "roti.you");
    if (you1.type !== "roti.you" || you2.type !== "roti.you") {
      throw new Error("unreachable");
    }
    expect(you1.yourScore).toBe(4);
    expect(you2.yourScore).toBe(4);
  });

  it("only accepts ROTI votes in the close phase", async () => {
    const { boardId, adminToken } = await createBoard();
    const admin = await joined(boardId, "Anna", adminToken);
    admin.socket.send({ type: "roti.set", score: 4 });
    const rejected = await admin.socket.waitForNext((e) => e.type === "reject");
    if (rejected.type !== "reject") throw new Error("unreachable");
    expect(rejected.code).toBe("PHASE_LOCKED");
    void opId;
  });
});
