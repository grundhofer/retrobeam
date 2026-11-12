// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

// Gate G13 (docs/sebaro-umbau.md §4.2), in the form the code took: the site
// root, sebaro's scripts and the fonts' licence texts are served by the
// retrobeam:sebaro Vite plugin (apps/web/sebaro-files.json) from the sebaro
// copy and from sebaro-product/web (the product kit's site root), not copied
// into public/, so nothing can drift from them. What is checked:
//   1. every file of sebaro-product/web is served, except the snippets (their
//      content stands in index.html) and theme-color.json (F29: no
//      theme-color);
//   2. every served source exists (the list names it relative to apps/web);
//   3. public/ holds only the files on its list below — no old brand file
//      stays without its counterpart (brand-mark.svg went in stage 6c).
//
//   node scripts/check-site-root.mjs   fail on any finding

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WEB = join(ROOT, "apps/web");
const SITE_ROOT = "../../sebaro-product/web";

export const PUBLIC_FILES = new Set([
  "_headers",
  "og.png",
  "og.png.license",
  "robots.txt",
  "sitemap.xml",
]);
export const NOT_SERVED = /snippet|^theme-color\.json$/;

export function findings({ siteRoot, served, publicFiles, exists }) {
  const out = [];
  const sources = new Set(Object.values(served));
  for (const name of siteRoot) {
    if (NOT_SERVED.test(name)) continue;
    if (!sources.has(`${SITE_ROOT}/${name}`))
      out.push(`site root file not served: ${name}`);
  }
  for (const [path, source] of Object.entries(served)) {
    if (!exists(source)) out.push(`served ${path} has no file ${source}`);
  }
  for (const name of publicFiles) {
    if (!PUBLIC_FILES.has(name))
      out.push(`public/ has a file off its list: ${name}`);
  }
  return out;
}

function main() {
  const out = findings({
    siteRoot: readdirSync(join(WEB, SITE_ROOT)),
    served: JSON.parse(readFileSync(join(WEB, "sebaro-files.json"), "utf8")),
    publicFiles: readdirSync(join(WEB, "public")),
    exists: (source) => existsSync(join(WEB, source)),
  });
  if (out.length > 0) {
    console.error("site root:");
    for (const line of out) console.error(`  ${line}`);
    return 1;
  }
  console.log("site root: served from sebaro-product/web, public/ on its list");
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
