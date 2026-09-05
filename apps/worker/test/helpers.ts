// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { SELF } from "cloudflare:test";
import { expect } from "vitest";
import { parseServerEvent, type ServerEvent } from "@retropolis/shared";

// The create/duplicate routes are rate limited per client IP. Real requests
// always carry cf-connecting-ip (Cloudflare sets it at the edge); SELF.fetch
// does not, so every test would otherwise share one bucket and the suite would
// throttle itself. Give each caller its own address — the limiter stays fully
// enforced, and a dedicated test hammers a single IP on purpose.
let ipCounter = 0;
export function freshIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter % 254}.${Math.floor(ipCounter / 254)}`;
}

export function ipHeaders(ip = freshIp()): Record<string, string> {
  return { "cf-connecting-ip": ip };
}

export async function createBoard(
  name = "Sprint 12",
  options: {
    template?: string;
    locale?: string;
    checkin?: boolean;
    layout?: "columns" | "canvas";
  } = {},
): Promise<{
  boardId: string;
  adminToken: string;
}> {
  const response = await SELF.fetch("https://example.com/api/boards", {
    method: "POST",
    headers: { "content-type": "application/json", ...ipHeaders() },
    body: JSON.stringify({ name, ...options }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { boardId: string; adminToken: string };
}

export interface TestSocket {
  ws: WebSocket;
  events: ServerEvent[];
  /** Waits until an event matching the predicate has arrived, INCLUDING ones
   *  already in the log. The predicate receives the event's index so a caller
   *  can require a fresh one: an "ack" barrier is otherwise satisfied by an ack
   *  from three commands ago, which silently turns a negative assertion into a
   *  no-op. Prefer `waitForNext` when the point is that something new arrives. */
  waitFor(
    predicate: (event: ServerEvent, index: number) => boolean,
  ): Promise<ServerEvent>;
  /** Like waitFor, but ignores everything already received. */
  waitForNext(predicate: (event: ServerEvent) => boolean): Promise<ServerEvent>;
  send(command: unknown): void;
}

export async function connect(boardId: string): Promise<TestSocket> {
  const response = await SELF.fetch(
    `https://example.com/api/boards/${boardId}/ws`,
    {
      headers: { Upgrade: "websocket" },
    },
  );
  expect(response.status).toBe(101);
  const ws = response.webSocket;
  if (!ws) throw new Error("no websocket on 101 response");
  ws.accept();

  const events: ServerEvent[] = [];
  const waiters: Array<() => void> = [];
  ws.addEventListener("message", (event) => {
    const parsed = parseServerEvent(event.data);
    if (parsed) {
      events.push(parsed);
      for (const wake of waiters.splice(0)) wake();
    }
  });

  const socket: TestSocket = {
    ws,
    events,
    async waitFor(predicate) {
      const deadline = Date.now() + 2000;
      for (;;) {
        const match = events.find((event, index) => predicate(event, index));
        if (match) return match;
        if (Date.now() > deadline) {
          throw new Error(
            `timed out waiting for event; saw: ${JSON.stringify(events)}`,
          );
        }
        await new Promise<void>((resolve) => {
          waiters.push(resolve);
          setTimeout(resolve, 50);
        });
      }
    },
    async waitForNext(predicate) {
      const from = events.length;
      return socket.waitFor(
        (event, index) => index >= from && predicate(event),
      );
    },
    send(command) {
      ws.send(JSON.stringify(command));
    },
  };
  return socket;
}
