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

export class RateLimiter extends DurableObject<Env> {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = 0;

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
