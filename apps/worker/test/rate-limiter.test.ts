// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { limiterStub } from "../src/board-stub.js";
import { createBoard, ipHeaders } from "./helpers.js";

// Cloudflare's Rate Limiting binding is documented as permissive and eventually
// consistent, and in production it admitted 50 board-creation requests from one
// address in a few seconds. These tests are about the replacement, which counts
// exactly because a Durable Object is single-threaded.

describe("RateLimiter", () => {
  it("admits the burst, refuses the rest, and says when to come back", async () => {
    const limiter = limiterStub(env);
    const key = `burst-${crypto.randomUUID()}`;
    const results = [];
    for (let i = 0; i < 14; i++) {
      results.push(await limiter.take(key, 10, 10 / 60));
    }
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    expect(results.filter((r) => !r.allowed)).toHaveLength(4);
    // A refusal has to tell the caller something actionable.
    for (const refused of results.filter((r) => !r.allowed)) {
      expect(refused.retryAfter).toBeGreaterThan(0);
    }
  });

  it("counts each key separately", async () => {
    const limiter = limiterStub(env);
    const mine = `a-${crypto.randomUUID()}`;
    const theirs = `b-${crypto.randomUUID()}`;
    for (let i = 0; i < 10; i++) await limiter.take(mine, 10, 10 / 60);
    expect((await limiter.take(mine, 10, 10 / 60)).allowed).toBe(false);
    // One abusive address must not lock everyone else out.
    expect((await limiter.take(theirs, 10, 10 / 60)).allowed).toBe(true);
  });

  it("refills over time", async () => {
    const limiter = limiterStub(env);
    const key = `refill-${crypto.randomUUID()}`;
    // A fast refill so the test does not have to wait a minute.
    for (let i = 0; i < 3; i++) await limiter.take(key, 3, 20);
    expect((await limiter.take(key, 3, 20)).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect((await limiter.take(key, 3, 20)).allowed).toBe(true);
  });
});

describe("board creation limit", () => {
  it("throttles one address without touching another", async () => {
    // Each admitted call mints a permanent, alarm-armed Durable Object, so an
    // unthrottled script would fill storage and spend the account-wide daily
    // allowance — taking every board offline until midnight UTC.
    const headers = { "content-type": "application/json", ...ipHeaders() };
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) {
      const res = await SELF.fetch("https://example.com/api/boards", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: `Flood ${i}` }),
      });
      statuses.push(res.status);
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(10);
    expect(statuses.filter((s) => s === 429)).toHaveLength(4);

    const other = await SELF.fetch("https://example.com/api/boards", {
      method: "POST",
      headers: { "content-type": "application/json", ...ipHeaders() },
      body: JSON.stringify({ name: "Innocent" }),
    });
    expect(other.status).toBe(200);
  });

  it("a refusal carries retry-after so a client can back off", async () => {
    const headers = { "content-type": "application/json", ...ipHeaders() };
    let refused: Response | null = null;
    for (let i = 0; i < 14 && refused === null; i++) {
      const res = await SELF.fetch("https://example.com/api/boards", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: `Backoff ${i}` }),
      });
      if (res.status === 429) refused = res;
    }
    expect(refused).not.toBeNull();
    expect(Number(refused?.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("request body limit", () => {
  it("refuses an oversized body before it reaches a handler", async () => {
    const res = await SELF.fetch("https://example.com/api/boards", {
      method: "POST",
      headers: { "content-type": "application/json", ...ipHeaders() },
      body: JSON.stringify({ name: "x".repeat(8000) }),
    });
    expect(res.status).toBe(413);
  });
});

describe("GIF search budget", () => {
  it("is per board, and costs no extra Durable Object call", async () => {
    // The route already had to ask the board whether GIFs are on; the budget
    // rides in that same answer. Per BOARD rather than per IP, so a team behind
    // one office address does not throttle itself during the appreciation round.
    const { boardId } = await createBoard();
    const url = `https://example.com/api/boards/${boardId}/gifs/search?q=party`;
    // Well past the burst: every call answers 200 with the same degraded shape
    // (no key is configured in tests), so exhausting the budget is not
    // observable to a caller — which is the point.
    // The burst is generous enough that a whole appreciation round never sees
    // it: sixty searches back to back all succeed.
    for (let i = 0; i < 60; i++) {
      const res = await SELF.fetch(url, { headers: ipHeaders() });
      expect(res.status).toBe(200);
    }
    // Past the burst the board is BUSY, not switched off. These must look
    // different to the user: "not set up" is permanent advice and makes people
    // stop using the feature; "busy" clears in seconds. The route says 429 and
    // the picker has its own message for it.
    let throttled: Response | null = null;
    for (let i = 0; i < 20 && throttled === null; i++) {
      const res = await SELF.fetch(url, { headers: ipHeaders() });
      if (res.status === 429) throttled = res;
    }
    expect(throttled, "the per-board GIF budget never engaged").not.toBeNull();
    expect(Number(throttled?.headers.get("retry-after"))).toBeGreaterThan(0);

    // A different board is unaffected by the first one's spending.
    const second = await createBoard();
    const fresh = await SELF.fetch(
      `https://example.com/api/boards/${second.boardId}/gifs/search?q=party`,
      { headers: ipHeaders() },
    );
    expect(await fresh.json()).toEqual({ configured: false, gifs: [] });
  });
});
