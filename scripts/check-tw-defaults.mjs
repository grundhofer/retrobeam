// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

// A ratchet on Tailwind's default design vocabulary in apps/web.
//
// The UI is moving onto the sebaro design system (docs/sebaro-umbau.md §4.2,
// gate G7). sebaro's tokens.tailwind.css clears Tailwind's default palette,
// radii, shadows, type scale and breakpoints, so every class below silently
// stops existing on the day that file is imported: no build error, just an
// unstyled element. Until then the count per file may only fall — a view that
// has been moved over reaches zero, and nothing new adds to the pile.
//
// The patterns are bound to class tokens (nothing glued on either side), so
// `rounded-full`, `whitespace-nowrap` or the word "required" never count.
// Comments are not stripped: a class named in a comment is still counted,
// which errs on the side of looking at it.
//
//   node scripts/check-tw-defaults.mjs           fail if any file is over budget
//   node scripts/check-tw-defaults.mjs --list    also print every hit
//   node scripts/check-tw-defaults.mjs --update  write today's counts as budget

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BUDGET = join(ROOT, "scripts/tw-defaults.budget.json");
const SOURCES = join(ROOT, "apps/web/src");
const EXTRA = [join(ROOT, "apps/web/index.html")];

// Bounded on both sides: no word character or hyphen may touch the token.
const B = String.raw`(?<![\w-])`;
const E = String.raw`(?![\w-])`;
// Any number of variant prefixes (`hover:`, `sm:`, `group-hover:` …).
const V = String.raw`(?:[a-z0-9-]+:)*`;
const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|" +
  "teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black";
const UTILITY =
  "bg|text|border|ring|outline|from|via|to|fill|stroke|divide|placeholder|" +
  "decoration|accent|caret|shadow";

export const RULES = [
  // bg-zinc-100, hover:text-white, border-amber-400/50
  [
    "palette",
    new RegExp(
      `${B}${V}(?:${UTILITY})-(?:${PALETTE})(?:-\\d{2,3})?(?:/\\d+)?${E}`,
      "g",
    ),
  ],
  // rounded, rounded-lg, rounded-t-xl — but not rounded-full or rounded-none
  [
    "radius",
    new RegExp(
      `${B}${V}rounded(?:-(?:t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee))?(?:-(?:xs|sm|md|lg|xl|2xl|3xl|4xl))?${E}`,
      "g",
    ),
  ],
  [
    "type-scale",
    new RegExp(`${B}${V}text-(?:xs|sm|base|lg|xl|[2-9]xl)${E}`, "g"),
  ],
  ["shadow", new RegExp(`${B}${V}shadow(?:-(?:xs|sm|md|lg|xl|2xl))?${E}`, "g")],
  // sebaro keeps its own breakpoint names; md, xl and 2xl are not among them
  ["breakpoint", new RegExp(`${B}(?:md|xl|2xl):`, "g")],
  ["easing", new RegExp(`${B}${V}ease-(?:in|out|in-out)${E}`, "g")],
  ["dark-variant", new RegExp(`${B}dark:`, "g")],
  ["motion-variant", new RegExp(`${B}motion-(?:reduce|safe):`, "g")],
  // The app's own accent: with the token bridge it would turn cobalt silently.
  [
    "accent",
    new RegExp(
      `${B}${V}(?:bg|text|border|ring|outline|accent|decoration|fill|stroke)-accent(?:-strong)?(?:/\\d+)?${E}`,
      "g",
    ),
  ],
  ["font-mono", new RegExp(`${B}${V}font-mono${E}`, "g")],
  // px-2.5, gap-1.5: sebaro's spacing has no half steps
  ["half-step", new RegExp(`${B}${V}-?[a-z]+(?:-[a-z]+)*-[0-3]\\.5${E}`, "g")],
  ["dashed", new RegExp(`${B}${V}border-dashed${E}`, "g")],
  ["uppercase", new RegExp(`${B}${V}uppercase${E}`, "g")],
  [
    "hex",
    /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g,
  ],
];

// Every hit in one text, as { rule, line, match }.
export function scan(text) {
  const hits = [];
  const lines = text.split("\n");
  for (const [index, line] of lines.entries()) {
    for (const [rule, pattern] of RULES) {
      for (const match of line.matchAll(pattern)) {
        hits.push({ rule, line: index + 1, match: match[0] });
      }
    }
  }
  return hits;
}

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      // The export itself is sebaro's vocabulary, not a leftover.
      if (path === join(SOURCES, "sebaro") || entry.name === "__screenshots__")
        return [];
      return files(path);
    }
    if (!/\.(ts|tsx|css)$/.test(entry.name)) return [];
    if (/\.test\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

function main(args) {
  const counts = {};
  const listed = [];
  for (const path of [...files(SOURCES), ...EXTRA].sort()) {
    const hits = scan(readFileSync(path, "utf8"));
    const name = relative(ROOT, path);
    if (hits.length > 0) counts[name] = hits.length;
    for (const hit of hits)
      listed.push(`${name}:${hit.line}  ${hit.rule}  ${hit.match}`);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  if (args.includes("--update")) {
    writeFileSync(BUDGET, `${JSON.stringify(counts, null, 2)}\n`);
    console.log(
      `tw-defaults: budget written, ${total} hits in ${Object.keys(counts).length} files`,
    );
    return 0;
  }
  if (args.includes("--list")) console.log(listed.join("\n"));

  const budget = JSON.parse(readFileSync(BUDGET, "utf8"));
  const over = [];
  const under = [];
  for (const name of new Set([
    ...Object.keys(counts),
    ...Object.keys(budget),
  ])) {
    const now = counts[name] ?? 0;
    const allowed = budget[name] ?? 0;
    if (now > allowed) over.push(`  ${name}: ${now} (budget ${allowed})`);
    else if (now < allowed) under.push(`  ${name}: ${now} (budget ${allowed})`);
  }
  if (under.length > 0) {
    console.log(
      `tw-defaults: below budget — lower it with --update:\n${under.join("\n")}`,
    );
  }
  if (over.length > 0) {
    console.error(
      `tw-defaults: Tailwind default classes grew (docs/sebaro-umbau.md §4.2, G7):\n` +
        `${over.join("\n")}\n\nRun with --list to see each hit. Use sebaro's ` +
        `roles instead, or keep the count where it was.`,
    );
    return 1;
  }
  console.log(`tw-defaults: ${total} hits, none over budget`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
