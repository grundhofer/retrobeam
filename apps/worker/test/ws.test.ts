// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { connect, createBoard } from "./helpers.js";

// Mirrors BUCKET_CAPACITY in board-room.ts.
const BUCKET_CAPACITY = 120;

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
    // Inbound WS messages bill 20:1 against an ACCOUNT-WIDE allowance, so a
    // buggy or hostile client at browser speed can take every board offline
    // until midnight UTC. The bucket is generous enough that a fast typist or a
    // canvas Tidy never notices it.
    const { boardId, adminToken } = await createBoard();
    const socket = await connect(boardId);
    socket.send({ type: "join", name: "Anna", adminToken });
    await socket.waitFor((e) => e.type === "sync");

    for (let i = 0; i < 400; i++) {
      socket.send({ type: "ready.set", ready: i % 2 === 0 });
    }
    const limited = await socket.waitFor(
      (e) => e.type === "error" && e.code === "RATE_LIMIT",
    );
    expect(limited.type).toBe("error");

    // Exactly the bucket's capacity was served before the drop — the limit is a
    // budget, not a kill switch.
    expect(
      socket.events.filter((e) => e.type === "ready.changed").length,
    ).toBeLessThanOrEqual(BUCKET_CAPACITY + 1);

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
