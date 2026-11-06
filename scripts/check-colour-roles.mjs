// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

// sebaro's colour lint (gate G8, docs/sebaro-umbau.md §4.2; the pattern of
// sebaro spec/09): a status or accent colour is never a surface fill, and the
// "-subtle" tints are for sebaro's own parts. So `bg-accent`, `bg-link`,
// `bg-success`/`-warning`/`-danger`/`-info` and any `*-subtle` class may not
// appear in apps/web/src outside the exported sebaro folder. `text-text-subtle`
// is sebaro's own quiet text role and stays allowed (spec/01). It replaces
// check-contrast.mjs, whose zinc greys the token bridge removed (stage 6a,
// G15: G8 plus axe color-contrast in light and dark).
//
//   node scripts/check-colour-roles.mjs   fail on any hit

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCES = join(ROOT, "apps/web/src");

export const PATTERN =
  /bg-(?:accent|link|success|warning|danger|info)|-subtle/g;
export const ALLOWED = new Set(["text-text-subtle"]);

// The class-like token around a match, to test it against ALLOWED.
function tokenAt(line, index) {
  const before = line.slice(0, index).match(/[\w:\-()[\]/.]*$/)?.[0] ?? "";
  const after = line.slice(index).match(/^[\w:\-()[\]/.]*/)?.[0] ?? "";
  return (before + after).replace(/^(?:[a-z0-9-]+:)*/, "");
}

export function scanText(text) {
  const hits = [];
  for (const [index, line] of text.split("\n").entries()) {
    // One hit per token: bg-success-subtle matches both parts of the pattern.
    const tokens = new Set(
      [...line.matchAll(PATTERN)].map((match) => tokenAt(line, match.index)),
    );
    for (const token of tokens)
      if (!ALLOWED.has(token)) hits.push({ line: index + 1, token });
  }
  return hits;
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === "sebaro" ? [] : files(path);
    return /\.(tsx?|css)$/.test(name) ? [path] : [];
  });
}

function main() {
  const hits = files(SOURCES).flatMap((path) =>
    scanText(readFileSync(path, "utf8")).map(
      (hit) => `${relative(ROOT, path)}:${hit.line}  ${hit.token}`,
    ),
  );
  if (hits.length > 0) {
    console.error(
      "colour roles: a status or accent colour as a fill, or a -subtle tint:",
    );
    for (const hit of hits) console.error(`  ${hit}`);
    return 1;
  }
  console.log("colour roles: none");
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
