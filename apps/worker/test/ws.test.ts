// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { evictAllDurableObjects } from "cloudflare:test";
import { connect, createBoard } from "./helpers.js";

// Mirror the socket budget from board-room.ts. The refill rate matters here as
// much as the capacity: the bucket tops up while a flood is being served, so an
// assertion about "how many got through" is only meaningful against the elapsed
// time.
const BUCKET_CAPACITY = 120;
const BUCKET_REFILL_PER_SEC = 8;

describe("board room websocket flow", () => {
  it("join returns a sync snapshot with identity and roster", async () => {
    const { boardId, adminToken } = await createBoard();
    const anna = await connect(boardId);
    anna.send({ type: "join", name: "Anna", adminToken });

    const sync = await anna.waitFor((e) => e.type === "sync");
    if (sync.type !== "sync") throw new Error("unreachable");
    expect(sync.you.name).toBe("Anna");
    expect(sync.you.role).toBe("facilitator");
    expect(sync.you.sessionKey).toMatch(/^[0-9a-f]{32}$/);
    expect(sync.roster).toHaveLength(1);
    expect(sync.board.id).toBe(boardId);
  });

  it("a second participant appears for the first via presence.join", async () => {
    const { boardId } = await createBoard();
    const anna = await connect(boardId);
    anna.send({ type: "join", name: "Anna" });
    await anna.waitFor((e) => e.type === "sync");

    const ben = await connect(boardId);
    ben.send({ type: "join", name: "Ben" });

    const joined = await anna.waitFor((e) => e.type === "presence.join");
    if (joined.type !== "presence.join") throw new Error("unreachable");
    expect(joined.participant.name).toBe("Ben");
    expect(joined.participant.role).toBe("member");

    const benSync = await ben.waitFor((e) => e.type === "sync");
    if (benSync.type !== "sync") throw new Error("unreachable");
    expect(benSync.roster.map((p) => p.name).sort()).toEqual(["Anna", "Ben"]);
    expect(benSync.you.role).toBe("member");
  });

  it("colors are distinct and joining without the token stays member", async () => {
    const { boardId } = await createBoard();
    const anna = await connect(boardId);
    anna.send({ type: "join", name: "Anna" });
    const annaSync = await anna.waitFor((e) => e.type === "sync");
    const ben = await connect(boardId);
    ben.send({ type: "join", name: "Ben", adminToken: "f".repeat(32) });
    const benSync = await ben.waitFor((e) => e.type === "sync");
    if (annaSync.type !== "sync" || benSync.type !== "sync")
      throw new Error("unreachable");
    expect(benSync.you.role).toBe("member"); // wrong token grants nothing
    expect(benSync.you.color).not.toBe(annaSync.you.color);
  });

  it("closing the socket broadcasts presence.leave", async () => {
    const { boardId } = await createBoard();
    const anna = await connect(boardId);
    anna.send({ type: "join", name: "Anna" });
    await anna.waitFor((e) => e.type === "sync");

    const ben = await connect(boardId);
    ben.send({ type: "join", name: "Ben" });
    const benSync = await ben.waitFor((e) => e.type === "sync");
    if (benSync.type !== "sync") throw new Error("unreachable");

    ben.ws.close(1000, "bye");
    const left = await anna.waitFor((e) => e.type === "presence.leave");
    if (left.type !== "presence.leave") throw new Error("unreachable");
    expect(left.participantId).toBe(benSync.you.id);
  });

  it("rejoining with the session key keeps identity and allows renaming", async () => {
    const { boardId } = await createBoard();
    const first = await connect(boardId);
    first.send({ type: "join", name: "Anna" });
    const firstSync = await first.waitFor((e) => e.type === "sync");
    if (firstSync.type !== "sync") throw new Error("unreachable");
    first.ws.close(1000, "refresh");

    const second = await connect(boardId);
    second.send({
      type: "join",
      name: "Anna K.",
      sessionKey: firstSync.you.sessionKey,
    });
    const secondSync = await second.waitFor((e) => e.type === "sync");
    if (secondSync.type !== "sync") throw new Error("unreachable");
    expect(secondSync.you.id).toBe(firstSync.you.id);
    expect(secondSync.you.color).toBe(firstSync.you.color);
    expect(secondSync.you.name).toBe("Anna K.");
    expect(secondSync.roster).toHaveLength(1); // no duplicate participant
  });

  it("a retried first join with the same client-minted key never duplicates", async () => {
    // The ghost-participant scenario: the first join's sync is lost (tab
    // closed / connection dropped), the client retries on a fresh socket with
    // the SAME client-minted session key — it must reclaim, not duplicate.
    const { boardId } = await createBoard();
    const clientKey = "cd".repeat(16);

    const first = await connect(boardId);
    first.send({ type: "join", name: "Anna", sessionKey: clientKey });
    const firstSync = await first.waitFor((e) => e.type === "sync");
    if (firstSync.type !== "sync") throw new Error("unreachable");
    expect(firstSync.you.sessionKey).toBe(clientKey); // server adopted the client key
    first.ws.close(1000, "connection lost");

    const retry = await connect(boardId);
    retry.send({ type: "join", name: "Anna", sessionKey: clientKey });
    const retrySync = await retry.waitFor((e) => e.type === "sync");
    if (retrySync.type !== "sync") throw new Error("unreachable");
    expect(retrySync.you.id).toBe(firstSync.you.id);
    expect(retrySync.roster).toHaveLength(1);
  });

  it("rejects oversized frames with a typed error", async () => {
    const { boardId } = await createBoard();
    const socket = await connect(boardId);
    socket.ws.send(`{"type":"join","name":"${"x".repeat(9000)}"}`);
    const error = await socket.waitFor((e) => e.type === "error");
    if (error.type !== "error") throw new Error("unreachable");
    expect(error.code).toBe("BAD_MESSAGE");
  });

  it("answers garbage with a typed error and stays alive", async () => {
    const { boardId } = await createBoard();
    const socket = await connect(boardId);
    socket.ws.send("{broken json");
    const error = await socket.waitFor((e) => e.type === "error");
    if (error.type !== "error") throw new Error("unreachable");
    expect(error.code).toBe("BAD_MESSAGE");

    socket.send({ type: "join", name: "Anna" });
    await socket.waitFor((e) => e.type === "sync");
  });
});

describe("per-socket message budget", () => {
  it("drops a flood without closing the socket, and recovers", async () => {
    // Inbound WS messages get a 20:1 billing discount, but the allowance is
    // ACCOUNT-WIDE, so a client looping at machine speed still spends every
    // board's budget. The bucket caps one socket at 8 frames a second, which no
    // human interaction approaches — a fast typist or a canvas Tidy never
    // notices it.
    const { boardId, adminToken } = await createBoard();
    const socket = await connect(boardId);
    socket.send({ type: "join", name: "Anna", adminToken });
    await socket.waitFor((e) => e.type === "sync");

    const floodStartedAt = Date.now();
    for (let i = 0; i < 400; i++) {
      socket.send({ type: "ready.set", ready: i % 2 === 0 });
    }
    const limited = await socket.waitFor(
      (e) => e.type === "error" && e.code === "RATE_LIMIT",
    );
    expect(limited.type).toBe("error");

    // The bucket's capacity was served before the drop — the limit is a budget,
    // not a kill switch.
    //
    // The ceiling has to account for the refill that happens WHILE the flood is
    // being served: the bucket tops up at BUCKET_REFILL_PER_SEC, and 400 frames
    // do not arrive instantaneously. A fixed `capacity + 1` silently assumed a
    // machine fast enough to drain the bucket inside ~100ms; on a CI runner the
    // same code legitimately served 125 and the suite went red on a stopwatch,
    // not on a defect.
    const servedWindowSec = (Date.now() - floodStartedAt) / 1000;
    const served = socket.events.filter(
      (e) => e.type === "ready.changed",
    ).length;
    expect(served).toBeLessThanOrEqual(
      BUCKET_CAPACITY + 1 + Math.ceil(servedWindowSec * BUCKET_REFILL_PER_SEC),
    );
    // …and a lower bound, so a bucket that refused almost everything could not
    // pass this test by being broken in the other direction.
    expect(served).toBeGreaterThanOrEqual(BUCKET_CAPACITY);

    // The socket stays usable: a legitimate client that briefly overran must
    // not lose its board. The bucket refills, so an ordinary frame is served
    // again. (`resync` costs 20, so it stays refused for longer — deliberately,
    // since it is the one command whose cost is unbounded by its input.)
    await new Promise((resolve) => setTimeout(resolve, 500));
    socket.send({ type: "ready.set", ready: true });
    const recovered = await socket.waitFor(
      (e) => e.type === "ready.changed" && e.ready === true,
    );
    expect(recovered.type).toBe("ready.changed");
  });
});

describe("hibernation survival", () => {
  it("identity, budget and state survive the Durable Object being evicted", async () => {
    // Architecture rule 2 makes this load-bearing: the object keeps NO
    // in-memory session state, so an idle board can hibernate and bill zero.
    // Everything a handler needs lives in SQLite or in the socket attachment.
    // Nothing proved it — an accidental instance field would have looked fine
    // in every other test, because they never let the object go away.
    const { boardId, adminToken } = await createBoard();
    const socket = await connect(boardId);
    socket.send({ type: "join", name: "Anna", adminToken });
    const sync = await socket.waitFor((e) => e.type === "sync");
    if (sync.type !== "sync") throw new Error("unreachable");
    const columnId = sync.columns[0]?.id ?? "";

    socket.send({ type: "admin.phase.set", phase: "write" });
    await socket.waitForNext(
      (e) => e.type === "phase.changed" && e.phase === "write",
    );
    const before = crypto.randomUUID().replaceAll("-", "");
    socket.send({
      type: "note.create",
      opId: "e".repeat(32),
      noteId: before,
      columnId,
      text: "written before eviction",
    });
    await socket.waitForNext((e) => e.type === "note.created");

    // Tear the instance down. Storage is kept and the socket is hibernated
    // rather than closed, which is exactly what an idle board does in
    // production.
    await evictAllDurableObjects();

    // The SAME socket still works, and the participant is still the
    // facilitator — that role came back from the attachment, not from memory.
    const after = crypto.randomUUID().replaceAll("-", "");
    socket.send({
      type: "note.create",
      opId: "f".repeat(32),
      noteId: after,
      columnId,
      text: "written after eviction",
    });
    await socket.waitForNext(
      (e) => e.type === "note.created" && e.note.id === after,
    );

    socket.send({ type: "resync" });
    const resumed = await socket.waitForNext((e) => e.type === "sync");
    if (resumed.type !== "sync") throw new Error("unreachable");
    expect(resumed.you.role).toBe("facilitator");
    expect(resumed.you.id).toBe(sync.you.id);
    expect(resumed.phase).toBe("write");
    expect(resumed.notes.map((n) => n.id).sort()).toEqual(
      [before, after].sort(),
    );
  });
});
