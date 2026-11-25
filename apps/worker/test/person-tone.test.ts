// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  env,
  evictAllDurableObjects,
  runInDurableObject,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@retrobeam/shared";
import { boardStub } from "../src/board-stub.js";
import { connect, createBoard, type TestSocket } from "./helpers.js";

// sebaro's person tone (FAR-16, v3.1.2): the server stores a number from 1 to
// 12 instead of a colour, and still sends the old colour for open tabs.

type SyncEvent = Extract<ServerEvent, { type: "sync" }>;

async function joined(
  boardId: string,
  name: string,
  adminToken?: string,
): Promise<{ socket: TestSocket; sync: SyncEvent }> {
  const socket = await connect(boardId);
  socket.send({
    type: "join",
    name,
    ...(adminToken === undefined ? {} : { adminToken }),
  });
  const sync = await socket.waitFor((e) => e.type === "sync");
  if (sync.type !== "sync") throw new Error("unreachable");
  return { socket, sync };
}

describe("person tones", () => {
  it("hands out the tones in join order, with the old colour beside them", async () => {
    const { boardId, adminToken } = await createBoard("Tones");
    const anna = await joined(boardId, "Anna", adminToken);
    const ben = await joined(boardId, "Ben");
    expect(anna.sync.you.tone).toBe(1);
    expect(ben.sync.you.tone).toBe(2);
    // The deprecated wire colour: what a tab from before drew for tone 2.
    expect(ben.sync.you.color).toBe("#008792");
  });

  it("gives people who joined before tones the tone at their colour's place", async () => {
    const { boardId, adminToken } = await createBoard("Legacy tones");
    await joined(boardId, "Anna", adminToken);
    await joined(boardId, "Ben");

    // Rewind to what the previous release stored: a colour and no tone. Ben
    // holds the fourth colour of the 2026-11-20 palette, Anna the seventh of
    // the palette before it.
    await runInDurableObject(boardStub(env, boardId), (_i, state) => {
      state.storage.sql.exec(
        "UPDATE participants SET tone = NULL, color = '#8766D2' WHERE name = 'Ben'",
      );
      state.storage.sql.exec(
        "UPDATE participants SET tone = NULL, color = '#E8B50C' WHERE name = 'Anna'",
      );
    });
    await evictAllDurableObjects(); // forces migrate() to run on the next wake
    const cara = await joined(boardId, "Cara");
    const tones = Object.fromEntries(
      cara.sync.roster.map((p) => [p.name, p.tone]),
    );
    expect(tones).toEqual({ Anna: 7, Ben: 4, Cara: 1 });
  });
});
