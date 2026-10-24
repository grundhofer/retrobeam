// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

// A ratchet on copy that breaks sebaro's writing rules (docs/sebaro-umbau.md
// §7.1, gate G11), for the German and the English UI strings in
// apps/web/src/i18n.ts and the German text of apps/web/index.html (its static
// fallback and link-preview tags). Each language and rule has its own budget,
// and a count may only fall; the copy fixes bring them to zero view by view.
//
// Rule ids are those of the sebaro guide's rule catalogue; spec/07 is the
// voice chapter of the design system. Every hit is a candidate for review, not
// a verdict: a quotation keeps its exclamation mark, and a reviewed exception
// stays in the budget.
//
//   node scripts/check-copy.mjs           fail if a count is over budget
//   node scripts/check-copy.mjs --list    also print every hit
//   node scripts/check-copy.mjs --update  write today's counts as budget

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BUDGET = join(ROOT, "scripts/copy.budget.json");
const I18N = join(ROOT, "apps/web/src/i18n.ts");
const HTML = join(ROOT, "apps/web/index.html");

// spec/07 §3 rule 4 asks for U+00A0 between a number and its unit; a plain
// space there is a hit.
const UNITS_DE = "%|Tagen?|Min\\.|Std\\.|Karten?|Stimmen?|Personen|Antworten?";
const UNITS_EN = "%|days?|min|cards?|votes?|people|answers?";

const SHARED = [
  // HAL-05, spec/07 §6.4: no exclamation marks in the UI
  ["exclamation", /!/g],
  // spec/07 §3 rule 4: fractions with a spaced slash, „5 / 8“
  ["fraction", /(?:\d|\}\})\/(?:\d|\{\{)/g],
  // spec/07 §3 rule 7 and the "…" item list: a space before the ellipsis
  // (a path placeholder such as "/board/…" is not prose)
  ["ellipsis", /[^\s/]…/g],
  // HAL-05: no emoji in UI words (user content is not in these files)
  ["emoji", /\p{Extended_Pictographic}/gu],
  // spec/07 §7: words a claim must not lean on
  [
    "banned-word",
    /tracking|zertifiziert|tüv|garantiert|dsgvo-konform|100 ?% privat|in der cloud|eu-server/gi,
  ],
];

export const RULES = {
  de: [
    ...SHARED,
    // TXT-05: no sign inside a word for groups of people
    ["gender-sign", /[a-zäöüß][*:_·](?:in|innen|r|n)\b|[a-zäöüß]Innen\b/g],
    // spec/07 §3 rule 6: the spaced en dash, not the em dash
    ["em-dash", /—/g],
    [
      "unit-space",
      new RegExp(`(?:\\d|\\}\\}) (?:${UNITS_DE})(?![\\wäöü])`, "g"),
    ],
    // spec/07 §2: the interface says "du", not "wir"
    ["wir", /\b[Ww]ir\b/g],
    // spec/07 (script strings): „Noch mal versuchen“
    ["retry", /[Ee]rneut versuchen/g],
    // spec/07 §3 rule 8: spelled out
    ["abbreviation", /\b(?:Max|ca)\.|\bz\. ?B\./g],
    // D99: no required marks, optional fields say „(optional)“
    ["required-mark", /Pflicht|\s\*$/g],
    // docs/sebaro-umbau.md §7.1: privacy wording that needs the owner's words
    ["privacy-claim", /kein Tracking|in der EU gespeichert|EU-Rechenzentren/gi],
  ],
  en: [
    ...SHARED,
    ["unit-space", new RegExp(`(?:\\d|\\}\\}) (?:${UNITS_EN})\\b`, "g")],
    ["retry", /\bRetry\b/g],
  ],
};

// The string literals of one language block of i18n.ts, with their line.
// Object keys are identifiers, but a quoted key ("1": …) is skipped.
export function i18nStrings(source, language) {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line === `  ${language}: {`);
  if (start === -1) throw new Error(`no "${language}" block in i18n.ts`);
  const end = lines.findIndex(
    (line, index) =>
      index > start && /^ {2}[a-z]+: \{$|^\} as const;$/.test(line),
  );
  const strings = [];
  for (let index = start + 1; index < end; index++) {
    for (const match of lines[index].matchAll(/"((?:[^"\\]|\\.)*)"(\s*:)?/g)) {
      if (!match[2]) strings.push({ line: index + 1, text: match[1] });
    }
  }
  return strings;
}

// What a reader of index.html sees: text nodes and content="…" attributes,
// without scripts, styles and comments. Lines are kept for the report.
export function htmlStrings(source) {
  const blanked = source.replace(
    /<!--[\s\S]*?-->|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g,
    (block) => block.replace(/[^\n]/g, " "),
  );
  const strings = [];
  for (const [index, line] of blanked.split("\n").entries()) {
    for (const match of line.matchAll(/content="([^"]*)"/g))
      strings.push({ line: index + 1, text: match[1] });
    const text = line.replace(/<[^>]*>/g, " ").trim();
    if (text) strings.push({ line: index + 1, text });
  }
  return strings;
}

export function scan(strings, rules) {
  const hits = [];
  for (const { line, text } of strings) {
    for (const [rule, pattern] of rules) {
      for (const match of text.matchAll(pattern)) {
        hits.push({ rule, line, match: match[0] });
      }
    }
  }
  return hits;
}

function main(args) {
  const i18n = readFileSync(I18N, "utf8");
  const sources = {
    de: scan(i18nStrings(i18n, "de"), RULES.de),
    en: scan(i18nStrings(i18n, "en"), RULES.en),
    "index.html": scan(htmlStrings(readFileSync(HTML, "utf8")), RULES.de),
  };
  const counts = {};
  for (const [source, hits] of Object.entries(sources)) {
    counts[source] = {};
    for (const hit of hits)
      counts[source][hit.rule] = (counts[source][hit.rule] ?? 0) + 1;
  }

  if (args.includes("--update")) {
    writeFileSync(BUDGET, `${JSON.stringify(counts, null, 2)}\n`);
    console.log("copy: budget written");
    return 0;
  }
  if (args.includes("--list")) {
    for (const [source, hits] of Object.entries(sources)) {
      const file =
        source === "index.html"
          ? "apps/web/index.html"
          : `apps/web/src/i18n.ts (${source})`;
      for (const hit of hits)
        console.log(`${file}:${hit.line}  ${hit.rule}  ${hit.match}`);
    }
  }

  const budget = JSON.parse(readFileSync(BUDGET, "utf8"));
  const over = [];
  const under = [];
  for (const source of Object.keys(sources)) {
    const rules = new Set([
      ...Object.keys(counts[source]),
      ...Object.keys(budget[source] ?? {}),
    ]);
    for (const rule of rules) {
      const now = counts[source][rule] ?? 0;
      const allowed = budget[source]?.[rule] ?? 0;
      if (now > allowed)
        over.push(`  ${source} ${rule}: ${now} (budget ${allowed})`);
      else if (now < allowed)
        under.push(`  ${source} ${rule}: ${now} (budget ${allowed})`);
    }
  }
  if (under.length > 0) {
    console.log(
      `copy: below budget — lower it with --update:\n${under.join("\n")}`,
    );
  }
  if (over.length > 0) {
    console.error(
      `copy: strings that break sebaro's writing rules grew (docs/sebaro-umbau.md §7.1, G11):\n` +
        `${over.join("\n")}\n\nRun with --list to see each hit.`,
    );
    return 1;
  }
  console.log("copy: none over budget");
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
