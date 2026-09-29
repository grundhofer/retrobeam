// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { generateSessionKey, type ServerEvent } from "@retrobeam/shared";
import { connect, createBoard, type TestSocket } from "./helpers.js";

// The facilitator link (`/board/<id>#admin=<token>`) is a client-side affair:
// the fragment never reaches the server, the web app stores the token and the
// ordinary join sends it. So what the server has to get right is the join
// itself, from the three places a link can be opened: a new device, a tab that
// is already in the room as a member, and a session a facilitator demoted.

type SyncEvent = Extract<ServerEvent, { type: "sync" }>;

async function joinAs(
  boardId: string,
  name: string,
  sessionKey: string,
  adminToken?: string,
): Promise<{ socket: TestSocket; you: SyncEvent["you"] }> {
  const socket = await connect(boardId);
  socket.send({
    type: "join",
    name,
    sessionKey,
    ...(adminToken === undefined ? {} : { adminToken }),
  });
  const sync = await socket.waitFor((e) => e.type === "sync");
  if (sync.type !== "sync") throw new Error("unreachable");
  return { socket, you: sync.you };
}

describe("facilitator link", () => {
  it("a second device with the token is a facilitator of its own", async () => {
    const { boardId, adminToken } = await createBoard();
    const laptop = await joinAs(
      boardId,
      "Anna",
      generateSessionKey(),
      adminToken,
    );
    const roomPc = await joinAs(
      boardId,
      "Anna (room)",
      generateSessionKey(),
      adminToken,
    );

    expect(laptop.you.role).toBe("facilitator");
    expect(roomPc.you.role).toBe("facilitator");
    // A separate participant, not a takeover of the laptop's seat.
    expect(roomPc.you.id).not.toBe(laptop.you.id);

    roomPc.socket.send({ type: "admin.phase.set", phase: "write" });
    await roomPc.socket.waitFor(
      (e) => e.type === "phase.changed" && e.phase === "write",
    );
  });

  it("a member's tab that opens the link rejoins as facilitator, same seat", async () => {
    const { boardId, adminToken } = await createBoard();
    await joinAs(boardId, "Anna", generateSessionKey(), adminToken);
    const key = generateSessionKey();
    const before = await joinAs(boardId, "Ben", key);
    expect(before.you.role).toBe("member");

    before.socket.ws.close(1000, "link opened");
    const after = await joinAs(boardId, "Ben", key, adminToken);
    expect(after.you.role).toBe("facilitator");
    expect(after.you.id).toBe(before.you.id);
  });

  it("a demotion sticks to its session, even with the token; a new session is not demoted", async () => {
    const { boardId, adminToken } = await createBoard();
    const key = generateSessionKey();
    const anna = await joinAs(boardId, "Anna", key, adminToken);
    const ben = await joinAs(boardId, "Ben", generateSessionKey());

    anna.socket.send({
      type: "admin.role.set",
      participantId: ben.you.id,
      role: "facilitator",
    });
    await ben.socket.waitFor(
      (e) =>
        e.type === "roster.updated" &&
        e.participant.id === ben.you.id &&
        e.participant.role === "facilitator",
    );
    ben.socket.send({
      type: "admin.role.set",
      participantId: anna.you.id,
      role: "member",
    });
    await anna.socket.waitFor(
      (e) =>
        e.type === "roster.updated" &&
        e.participant.id === anna.you.id &&
        e.participant.role === "member",
    );

    // Opening the link in the demoted tab: same session, stays a member.
    anna.socket.ws.close(1000, "link opened");
    const again = await joinAs(boardId, "Anna", key, adminToken);
    expect(again.you.role).toBe("member");

    // On another device the token is the capability it always was: the
    // demotion was a decision about a seat, and nothing revokes a token.
    // Recorded here so a change to either half is a deliberate one.
    const elsewhere = await joinAs(
      boardId,
      "Anna (room)",
      generateSessionKey(),
      adminToken,
    );
    expect(elsewhere.you.role).toBe("facilitator");
  });
});
