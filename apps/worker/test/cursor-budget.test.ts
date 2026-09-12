// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { env } from "cloudflare:test";
import { expect, it } from "vitest";
import { limiterStub } from "../src/board-stub.js";
import {
  CURSOR_BUDGET_KEY,
  CURSOR_DAILY_MESSAGE_LIMIT,
} from "../src/rate-limiter.js";
import { connect, createBoard } from "./helpers.js";

it("disables only live cursors when the account-wide daily budget is exhausted", async () => {
  const { boardId, adminToken } = await createBoard("Cursor budget");
  const admin = await connect(boardId);
  admin.send({ type: "join", name: "Anna", adminToken });
  await admin.waitFor((event) => event.type === "sync");

  const member = await connect(boardId);
  member.send({ type: "join", name: "Ben" });
  await member.waitFor((event) => event.type === "sync");

  admin.send({ type: "admin.cursors.set", enabled: true });
  await admin.waitForNext(
    (event) =>
      event.type === "config.changed" && event.config.cursorsEnabled === true,
  );

  // This test file has isolated DO storage. Reserve the entire real production
  // allowance so the board's very first cursor frame reaches the cutoff path.
  const lease = await limiterStub(env).leaseDaily(
    CURSOR_BUDGET_KEY,
    CURSOR_DAILY_MESSAGE_LIMIT,
    CURSOR_DAILY_MESSAGE_LIMIT,
  );
  expect(lease.remaining).toBe(0);

  member.send({ type: "presence.cursor", x: 0.25, y: 0.75 });
  const disabled = await admin.waitForNext(
    (event) =>
      event.type === "config.changed" && event.config.cursorsEnabled === false,
  );
  expect(disabled.type).toBe("config.changed");
  const warning = await admin.waitForNext(
    (event) => event.type === "error" && event.code === "CURSOR_BUDGET",
  );
  expect(warning.type).toBe("error");

  // Repeated toggling cannot bypass the cutoff or spend writes in an on/off
  // loop. The board remains disabled until the next UTC day.
  admin.send({ type: "admin.cursors.set", enabled: true });
  const refusedEnable = await admin.waitForNext(
    (event) => event.type === "error" && event.code === "CURSOR_BUDGET",
  );
  expect(refusedEnable.type).toBe("error");

  // The preference is switched off in storage as well, so reconnecting clients
  // cannot resume spending until a facilitator deliberately enables it later.
  const newcomer = await connect(boardId);
  newcomer.send({ type: "join", name: "Cara" });
  const sync = await newcomer.waitFor((event) => event.type === "sync");
  if (sync.type !== "sync") throw new Error("unreachable");
  expect(sync.config.cursorsEnabled).toBe(false);

  // The reserved capacity is doing its job: core retro mutations still pass.
  admin.send({ type: "admin.phase.set", phase: "write" });
  await admin.waitForNext(
    (event) => event.type === "phase.changed" && event.phase === "write",
  );
  const columnId = sync.columns[0]?.id;
  if (columnId === undefined) throw new Error("missing test column");
  const noteId = crypto.randomUUID().replaceAll("-", "");
  member.send({
    type: "note.create",
    opId: crypto.randomUUID().replaceAll("-", ""),
    noteId,
    columnId,
    text: "Core actions still work",
  });
  const created = await member.waitForNext(
    (event) => event.type === "note.created" && event.note.id === noteId,
  );
  expect(created.type).toBe("note.created");
});
