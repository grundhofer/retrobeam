// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// Firefox hands the focus to a test file's frame only when something in that
// frame asks for it. A file whose test typed or clicked (Playwright focuses
// that file's frame) leaves the next file's frame unfocused, and there a plain
// element.focus() does nothing: document.activeElement stays <body>, the next
// Enter lands on nothing, and which test fails depends only on the file order
// (SkipLink's Enter test after any file that used fill or click). Vitest's own
// keyboard command already calls window.focus() for this case, but only when
// the page has no focused element yet. This setup file, served from memory so
// no test file carries it, does the same once at the start of every Firefox
// file, as a real tab's page always has the focus. Vitest resolves the name
// against this folder; no such file exists.
const FIREFOX_FRAME_FOCUS = "./firefox-frame-focus.setup.ts";
const isFirefoxFrameFocus = (id: string) =>
  id.replace(/\?.*$/, "").endsWith("/firefox-frame-focus.setup.ts");
const firefoxFrameFocus: Plugin = {
  name: "retrobeam:firefox-frame-focus",
  load: (id) => (isFirefoxFrameFocus(id) ? "window.focus();" : undefined),
};

// Component tests run in three real engines (Vitest Browser Mode) — motion,
// drag and canvas need no jsdom shims. Chromium alone was hiding real
// differences — WebKit commits a React re-render later, which is a class of
// bug a user hits and a Chromium-only suite never sees. The cloudflare plugin
// deliberately does not run here; anything socket-shaped is faked behind the
// BoardSocket interface.
export default defineConfig({
  plugins: [react(), tailwindcss(), firefoxFrameFocus],
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
      // Chromium, WebKit and Firefox — three engines, three layout/rendering
      // families. Firefox gets the frame focus setup above.
      instances: [
        { browser: "chromium" },
        { browser: "webkit" },
        { browser: "firefox", setupFiles: [FIREFOX_FRAME_FOCUS] },
      ],
    },
  },
});
