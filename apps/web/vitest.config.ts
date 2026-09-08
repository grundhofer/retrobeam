// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

// Component tests run in real Chromium (Vitest Browser Mode) — motion, drag
// and canvas need no jsdom shims. The cloudflare plugin deliberately does not
// run here; anything socket-shaped is faked behind the BoardSocket interface.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Browser mode pre-bundles dependencies separately from the test's own React,
  // and react-router's hooks then run against a second, dispatcher-less copy
  // ("Cannot read properties of null (reading 'useRef')" the moment a routed
  // component renders). Deduping pins every importer to one React.
  resolve: { dedupe: ["react", "react-dom"] },
  test: {
    // .ts as well as .tsx — a non-JSX test (the i18n parity check, socket
    // helpers) was silently invisible to the runner under a .tsx-only glob.
    include: ["src/**/*.test.{ts,tsx}"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
});
