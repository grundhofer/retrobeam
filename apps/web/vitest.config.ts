// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

// Component tests run in two real engines (Vitest Browser Mode) — motion, drag
// and canvas need no jsdom shims. Chromium alone was hiding real differences —
// WebKit commits a React re-render later, which is a class of bug a user hits
// and a Chromium-only suite never sees. The cloudflare plugin deliberately does not
// run here; anything socket-shaped is faked behind the BoardSocket interface.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Browser mode pre-bundles dependencies separately from the test's own React,
  // and react-router's hooks then run against a second, dispatcher-less copy
  // ("Cannot read properties of null (reading 'useRef')" the moment a routed
  // component renders). Deduping pins every importer to one React.
  // zustand joins them: it calls React hooks from its own pre-bundled copy, so
  // a component reading the board store rendered against a second, dispatcher-
  // less React ("Cannot read properties of null (reading 'useCallback')").
  resolve: { dedupe: ["react", "react-dom", "zustand"] },
  test: {
    // .ts as well as .tsx — a non-JSX test (the i18n parity check, socket
    // helpers) was silently invisible to the runner under a .tsx-only glob.
    include: ["src/**/*.test.{ts,tsx}"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      // Chromium and WebKit — two engines, two layout/rendering families.
      //
      // Firefox is deliberately NOT here, and it is not an oversight: under the
      // full-suite run its browser-mode page stops delivering interactions to
      // React entirely (BoardMenu's trigger is in the DOM, the click lands on
      // nothing, and even a hand-dispatched bubbling MouseEvent does not reach
      // the handler), while the identical test passes in Firefox on its own and
      // the whole e2e suite passes in real Firefox. That is a harness problem,
      // not a product one, so Firefox is covered where it actually exercises
      // the app: playwright.config.ts runs every e2e spec in it.
      instances: [{ browser: "chromium" }, { browser: "webkit" }],
    },
  },
});
