// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { DurableObject } from "cloudflare:workers";

// Why this exists rather than Cloudflare's Rate Limiting binding.
//
// That binding is documented as "permissive, eventually consistent, and
// intentionally designed to not be used as an accurate accounting system": each
// counter is cached on the machine that served the request and reconciled in
// the background, with a separate limit per Cloudflare location. On a
// high-traffic Worker that sheds load well. On a low-traffic one like this it
// does nothing measurable — 50 board-creation requests from one address in a
// few seconds were all admitted in production, because no single machine ever
// accumulated a count. A brake that silently does nothing is worse than none,
// because it invites the belief that the endpoint is protected.
//
// A Durable Object counts exactly: one instance, single-threaded, so every
// check sees every previous one.
//
// The buckets live in MEMORY on purpose, and this is the one place in the
// codebase where that is correct. Rate-limit state is inherently ephemeral: the
// object is only evicted when it has been idle, which is precisely when there
// is nothing to limit, and the worst case is that one burst window is forgiven.
// Persisting it would spend the free tier's 100k-rows-per-day write budget on
// exactly the traffic we are trying not to pay for.
interface Bucket {
  tokens: number;
  at: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Whole seconds until at least one token is available. */
  retryAfter: number;
}

export interface DailyBudgetLease {
  granted: number;
  remaining: number;
  resetsAt: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// 1.2M incoming cursor frames are billed at Cloudflare's 20:1 WebSocket ratio:
// 60k Durable Object requests, or 60% of the 100k/day Free allowance. Leasing
// in chunks keeps the guard itself to at most 600 RPCs + row writes per day.
export const CURSOR_DAILY_MESSAGE_LIMIT = 1_200_000;
export const CURSOR_MESSAGE_LEASE_SIZE = 2_000;
export const CURSOR_BUDGET_KEY = "cursor-messages";

export class RateLimiter extends DurableObject<Env> {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = 0;
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS daily_budgets (
        key TEXT PRIMARY KEY,
        utc_day INTEGER NOT NULL,
        used INTEGER NOT NULL
      )
    `);
  }

  /**
   * Take one token from `key`'s bucket.
   *
   * @param capacity burst size — how many are allowed back to back
   * @param refillPerSec sustained rate once the burst is spent
   */
  async take(
    key: string,
    capacity: number,
    refillPerSec: number,
  ): Promise<RateLimitDecision> {
    const now = Date.now();
    this.sweep(now, capacity, refillPerSec);

    const previous = this.buckets.get(key) ?? { tokens: capacity, at: now };
    const tokens = Math.min(
      capacity,
      previous.tokens + ((now - previous.at) / 1000) * refillPerSec,
    );
    if (tokens < 1) {
      // Remember the refill clock even on refusal, or a caller that keeps
      // hammering would never accrue anything.
      this.buckets.set(key, { tokens, at: now });
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((1 - tokens) / refillPerSec)),
      };
    }
    this.buckets.set(key, { tokens: tokens - 1, at: now });
    return { allowed: true, retryAfter: 0 };
  }

  /**
   * Reserve a coarse-grained slice of an account-wide daily budget.
   *
   * The reservation is persisted before it is returned, so concurrent boards
   * cannot overspend. A BoardRoom may hibernate before using its whole lease;
   * losing the unused tail deliberately under-counts capacity, never usage.
   */
  async leaseDaily(
    key: string,
    requested: number,
    limit: number,
    now = Date.now(),
  ): Promise<DailyBudgetLease> {
    const wanted = Math.max(1, Math.floor(requested));
    const ceiling = Math.max(1, Math.floor(limit));
    const utcDay = Math.floor(now / DAY_MS);
    const resetsAt = (utcDay + 1) * DAY_MS;
    const row = this.sql
      .exec("SELECT utc_day, used FROM daily_budgets WHERE key = ?", key)
      .toArray()[0];
    const used =
      row !== undefined && Number(row.utc_day) === utcDay
        ? Number(row.used)
        : 0;
    const granted = Math.min(wanted, Math.max(0, ceiling - used));

    // Once exhausted, repeated callers are read-only. This matters at the
    // cliff: attempts to protect the request budget must not consume writes.
    if (granted > 0 || row === undefined || Number(row.utc_day) !== utcDay) {
      this.sql.exec(
        `INSERT INTO daily_budgets (key, utc_day, used) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET utc_day = excluded.utc_day, used = excluded.used`,
        key,
        utcDay,
        used + granted,
      );
    }
    return {
      granted,
      remaining: ceiling - used - granted,
      resetsAt,
    };
  }

  /** Drop buckets that have refilled completely — they are indistinguishable
   *  from a caller that has never been seen, and keeping them would let the map
   *  grow with every distinct address. */
  private sweep(now: number, capacity: number, refillPerSec: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    const fullAfterMs = (capacity / refillPerSec) * 1000;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.at > fullAfterMs) this.buckets.delete(key);
    }
  }
}
