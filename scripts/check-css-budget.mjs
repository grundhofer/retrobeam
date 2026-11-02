// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

// Gate G17 (docs/sebaro-umbau.md §4.2): the size report of a built web app,
// and the CSS budget the owner set with F13: all CSS the first load fetches
// at most 75 KB gzip, measured after the build, as a browser receives it.
// The fonts are listed, not budgeted (WOFF2 is compressed already). Run it
// after `pnpm build`; it reads apps/web/dist/client.
//
//   node scripts/check-css-budget.mjs

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ASSETS = join(ROOT, "apps/web/dist/client/assets");
const BUDGET = 75_000;

const files = readdirSync(ASSETS);
const kb = (bytes) => `${(bytes / 1000).toFixed(1)} KB`;
let css = 0;
for (const name of files.filter((file) => file.endsWith(".css")).sort()) {
  const raw = readFileSync(join(ASSETS, name));
  const zipped = gzipSync(raw, { level: 9 }).length;
  css += zipped;
  console.log(`css   ${name}: ${kb(raw.length)} raw, ${kb(zipped)} gzip`);
}
for (const name of files.filter((file) => file.endsWith(".woff2")).sort()) {
  console.log(`font  ${name}: ${kb(readFileSync(join(ASSETS, name)).length)}`);
}
console.log(`css total ${kb(css)} gzip of ${kb(BUDGET)} (F13)`);
if (css === 0) {
  console.error("no CSS in the build: run `pnpm build` first");
  process.exit(1);
}
if (css > BUDGET) {
  console.error("over the CSS budget");
  process.exit(1);
}
