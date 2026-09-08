// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  // All specs share ONE vite dev server, so parallel specs contend for a single
  // workerd instance. The comment used to claim a sequential run while `workers`
  // was unset, which meant Playwright actually used half the cores against that
  // shared server — the contention the retries were absorbing was partly
  // self-inflicted. Run them serially and keep one retry as a genuine backstop.
  // Three browser projects triple the load on that one server, not the
  // parallelism — the projects run one after another, still one worker at a
  // time.
  workers: 1,
  retries: process.env.CI ? 2 : 1,
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  // Three engines, one shared dev server. The specs reach the DOM through
  // roles and test ids and touch no Chromium-only API — no clipboard, no
  // permissions query, no wheel event, no waitForTimeout — so the matrix costs
  // a browser download and a couple of minutes, not a rewrite.
  //
  // `browserName` rather than devices[…]: the Desktop presets only spoof a
  // user agent and, for Safari, double the device pixel ratio. Neither is what
  // these specs assert, and a spoofed UA would make a real engine difference
  // harder to read, not easier.
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  // vite dev runs the SPA, the Worker and the BoardRoom DO in real workerd —
  // the e2e suite exercises the same runtime that production uses.
  webServer: {
    command: "pnpm --filter @retropolis/web dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
  },
});
