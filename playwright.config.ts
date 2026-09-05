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
  workers: 1,
  retries: process.env.CI ? 2 : 1,
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  // vite dev runs the SPA, the Worker and the BoardRoom DO in real workerd —
  // the e2e suite exercises the same runtime that production uses.
  webServer: {
    command: "pnpm --filter @retropolis/web dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
  },
});
