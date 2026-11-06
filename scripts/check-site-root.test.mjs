// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert/strict";
import { test } from "node:test";
import { findings } from "./check-site-root.mjs";

const base = {
  siteRoot: ["favicon.ico", "head.snippet.html", "theme-color.json"],
  served: { "favicon.ico": "brand/site-root/favicon.ico" },
  publicFiles: ["robots.txt"],
  exists: () => true,
};

test("a complete site root, its snippets aside, passes", () => {
  assert.deepEqual(findings(base), []);
});

test("an unserved site-root file, a missing source and a stray public file count", () => {
  assert.deepEqual(
    findings({
      ...base,
      siteRoot: [...base.siteRoot, "icon.svg"],
      publicFiles: ["robots.txt", "brand-mark.svg"],
      exists: (source) => source !== "brand/site-root/favicon.ico",
    }),
    [
      "site root file not served: icon.svg",
      "served favicon.ico has no export file brand/site-root/favicon.ico",
      "public/ has a file off its list: brand-mark.svg",
    ],
  );
});
