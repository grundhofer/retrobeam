// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { FOLLOW_UP_ACTION_CAP, type ServerEvent } from "@retrobeam/shared";
import { boardStub } from "../src/board-stub.js";
import { connect, createBoard, ipHeaders, type TestSocket } from "./helpers.js";

let opCounter = 0xf0110;
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

// Phases only step forward one enabled phase at a time, so walk there.
async function toDiscuss(socket: TestSocket) {
  for (const phase of ["write", "present", "vote", "discuss"]) {
    socket.send({ type: "admin.phase.set", phase });
    await socket.waitForNext(
      (e) => e.type === "phase.changed" && e.phase === phase,
    );
  }
}

async function addAction(
  socket: TestSocket,
  text: string,
  ownerId: string | null = null,
): Promise<string> {
  const actionId = newId();
  socket.send({ type: "action.create", opId: opId(), actionId, text, ownerId });
  await socket.waitForNext(
    (e) => e.type === "action.created" && e.action.id === actionId,
  );
  return actionId;
}

const url = (id: string, route: "follow-up" | "duplicate") =>
  `https://example.com/api/boards/${id}/${route}`;

function post(
  id: string,
  route: "follow-up" | "duplicate",
  body: unknown,
  ip?: string,
) {
  return SELF.fetch(url(id, route), {
    method: "POST",
    headers: { "content-type": "application/json", ...ipHeaders(ip) },
    body: JSON.stringify(body),
  });
}

// A source board in discuss with three Action Items: one open and owned, one
// open and unassigned, one done.
async function sourceWithActions() {
  const { boardId, adminToken } = await createBoard("Sprint 47");
  const admin = await joined(boardId, "Anna", adminToken);
  await toDiscuss(admin.socket);
  await addAction(admin.socket, "Flaky Tests in Quarantäne", admin.you.id);
  await addAction(admin.socket, "Standup auf 15 Minuten");
  const doneId = await addAction(admin.socket, "Deploy-Freeze testen");
  admin.socket.send({
    type: "action.update",
    opId: opId(),
    actionId: doneId,
    status: "done",
  });
  await admin.socket.waitForNext(
    (e) => e.type === "action.updated" && e.action.status === "done",
  );
  return { boardId, adminToken, admin };
}

describe("follow-up retro", () => {
  it("carries the open Action Items as text only, labelled with the source name", async () => {
    const source = await sourceWithActions();
    const res = await post(source.boardId, "follow-up", {
      name: "Folge-Retro: Sprint 47",
      adminToken: source.adminToken,
    });
    expect(res.status).toBe(200);
    const created = (await res.json()) as {
      boardId: string;
      adminToken: string;
    };
    expect(created.boardId).not.toBe(source.boardId);
    expect(created.adminToken).not.toBe(source.adminToken);

    const next = await joined(created.boardId, "Ben", created.adminToken);
    expect(next.sync.board.name).toBe("Folge-Retro: Sprint 47");
    expect(next.sync.phase).toBe("lobby");
    // Only the open ones, in the source's order; done stays behind.
    expect(next.sync.actions.map((a) => a.text)).toEqual([
      "Flaky Tests in Quarantäne",
      "Standup auf 15 Minuten",
    ]);
    for (const action of next.sync.actions) {
      expect(action.status).toBe("open");
      expect(action.ownerId).toBeNull(); // the owner never crosses
      expect(action.carriedFrom).toBe("Sprint 47");
    }
    // Nothing in the new board points back at the old one: the id is a
    // capability, and neither it nor the old owner id may appear anywhere.
    const wire = JSON.stringify(next.sync);
    expect(wire).not.toContain(source.boardId);
    expect(wire).not.toContain(source.adminToken);
    expect(wire).not.toContain(source.admin.you.id);
  });

  it("answers a wrong token exactly like a missing board; no token is a 400", async () => {
    const source = await sourceWithActions();
    const wrong = await post(source.boardId, "follow-up", {
      adminToken: "0".repeat(32),
    });
    const missing = await post(newId(), "follow-up", {
      adminToken: source.adminToken,
    });
    expect(wrong.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await wrong.json()).toEqual(await missing.json());
    const noToken = await post(source.boardId, "follow-up", {});
    expect(noToken.status).toBe(400);
  });

  it("leaves duplicate structure-only — no Action Items cross", async () => {
    const source = await sourceWithActions();
    const res = await post(source.boardId, "duplicate", {
      adminToken: source.adminToken,
    });
    expect(res.status).toBe(200);
    const created = (await res.json()) as {
      boardId: string;
      adminToken: string;
    };
    const copy = await joined(created.boardId, "Ben", created.adminToken);
    expect(copy.sync.actions).toEqual([]);
  });

  it("works on a board without open items and keeps the anonymous flag", async () => {
    const { boardId, adminToken } = await createBoard("Anon", {
      anonymous: true,
    });
    const res = await post(boardId, "follow-up", { adminToken });
    expect(res.status).toBe(200);
    const created = (await res.json()) as {
      boardId: string;
      adminToken: string;
    };
    const next = await joined(created.boardId, "Ben", created.adminToken);
    expect(next.sync.actions).toEqual([]);
    expect(next.sync.config.anonymous).toBe(true);
    expect(next.sync.board.name).toBe("Anon"); // no name sent → source name
  });

  it(`carries at most ${FOLLOW_UP_ACTION_CAP} items`, async () => {
    const { boardId, adminToken } = await createBoard("Big");
    // Seed straight into SQLite: sixty action.create frames would trip the
    // per-socket rate limit long before the cap is reached.
    await runInDurableObject(boardStub(env, boardId), (_instance, state) => {
      for (let i = 0; i < FOLLOW_UP_ACTION_CAP + 10; i++) {
        state.storage.sql.exec(
          "INSERT INTO actions (id, text, owner_id, status, created_at) VALUES (?, ?, NULL, 'open', ?)",
          newId(),
          `item ${i}`,
          i,
        );
      }
    });
    const res = await post(boardId, "follow-up", { adminToken });
    expect(res.status).toBe(200);
    const created = (await res.json()) as {
      boardId: string;
      adminToken: string;
    };
    const next = await joined(created.boardId, "Ben", created.adminToken);
    expect(next.sync.actions).toHaveLength(FOLLOW_UP_ACTION_CAP);
    expect(next.sync.actions[0]?.text).toBe("item 0"); // oldest first
  });

  it("is rate limited per client IP like duplicate", async () => {
    const { boardId, adminToken } = await createBoard("Limited");
    const ip = "198.51.100.77";
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) {
      statuses.push(
        (await post(boardId, "follow-up", { adminToken }, ip)).status,
      );
    }
    // The same bucket as board creation: a burst of ten, then refusals.
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses.slice(10)).toEqual(Array(4).fill(429));
    // Per IP: someone else is not throttled by this caller.
    const other = await post(boardId, "follow-up", { adminToken });
    expect(other.status).toBe(200);
  });

  it("labels only carried items, which tick off like any other", async () => {
    const source = await sourceWithActions();
    const res = await post(source.boardId, "follow-up", {
      adminToken: source.adminToken,
    });
    const created = (await res.json()) as {
      boardId: string;
      adminToken: string;
    };
    const next = await joined(created.boardId, "Ben", created.adminToken);
    await toDiscuss(next.socket);
    const localId = await addAction(next.socket, "Neu in dieser Retro");
    const local = next.socket.events.find(
      (e) => e.type === "action.created" && e.action.id === localId,
    );
    expect(local?.type === "action.created" && local.action.carriedFrom).toBe(
      null,
    );
    // And a carried item can be ticked off like any other.
    const carried = next.sync.actions[0];
    if (carried === undefined) throw new Error("no carried action");
    next.socket.send({
      type: "action.update",
      opId: opId(),
      actionId: carried.id,
      status: "done",
    });
    const updated = await next.socket.waitForNext(
      (e) => e.type === "action.updated" && e.action.id === carried.id,
    );
    expect(updated.type === "action.updated" && updated.action).toMatchObject({
      status: "done",
      carriedFrom: "Sprint 47",
    });
  });
});
