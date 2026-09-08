// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import type {
  Browser,
  BrowserContext,
  BrowserContextOptions,
} from "@playwright/test";

// Board creation is rate limited per client IP — ten a minute, burst ten — and
// the key falls back to a single constant when `cf-connecting-ip` is absent,
// which it always is outside Cloudflare. Every browser context in the suite
// therefore drew from ONE bucket, while a full run needs about seventeen
// creates: it passed when they spread out and failed around m4-appreciation
// when they bunched up ("Creating the board failed. Please try again."), with
// CI surviving only because it is slower than a laptop.
//
// So each context gets its own address, exactly as the worker tests do with
// freshIp(). TEST-NET-3 (RFC 5737), which exists for this.
let contexts = 0;
// A per-process offset as well: files share this module under `workers: 1`, but
// nothing in Playwright promises that, and two files both starting at zero
// would quietly share a bucket again.
const runOffset = Math.floor(Math.random() * 200);

export async function newContext(
  browser: Browser,
  options: BrowserContextOptions = {},
): Promise<BrowserContext> {
  contexts += 1;
  const host = ((runOffset + contexts) % 254) + 1;
  return browser.newContext({
    ...options,
    extraHTTPHeaders: {
      "cf-connecting-ip": `203.0.113.${host}`,
      ...(options.extraHTTPHeaders ?? {}),
    },
  });
}
