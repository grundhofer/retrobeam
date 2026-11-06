// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

// What the copy ratchet counts, what it must leave alone, and how it finds the
// strings in the first place.

import assert from "node:assert/strict";
import { test } from "node:test";
import { RULES, htmlStrings, i18nStrings, scan } from "./check-copy.mjs";

const hits = (text, language = "de") =>
  scan([{ line: 1, text }], RULES[language]).map(
    (hit) => `${hit.rule}:${hit.match}`,
  );

test("German: signs inside words, the em dash, missing U+00A0, wir and Erneut", () => {
  assert.deepEqual(
    hits(
      "Für jede:r Autor:innen — wir zeigen 5 Tage, {{count}} Karten. Erneut versuchen",
    ),
    [
      "gender-sign:e:r",
      "gender-sign:r:innen",
      "em-dash:—",
      "unit-space:5 Tage",
      "unit-space:}} Karten",
      "wir:wir",
      "retry:Erneut versuchen",
    ],
  );
});

test("both languages: exclamation marks, unspaced fractions and ellipses, emoji", () => {
  assert.deepEqual(hits("Done! {{ready}}/{{total}} loading… 🎰", "en"), [
    "exclamation:!",
    "fraction:}}/{{",
    "ellipsis:g…",
    "emoji:🎰",
  ]);
});

test("the correct forms do not count", () => {
  assert.deepEqual(
    hits(
      "Alle Teilnehmenden – 5 Tage, {{count}} Karten, {{ready}} / {{total}} fertig, Wird geladen …",
    ),
    [],
  );
  assert.deepEqual(hits("Try again, {{host}}/board/…, 3 votes", "en"), []);
});

test("i18n.ts: only the values of the asked language block, never quoted keys", () => {
  const source = [
    "const resources = {",
    "  en: {",
    '    a: "Hello!",',
    '    "1": "one",',
    "  },",
    "  de: {",
    '    a: "Hallo",',
    "  },",
    "} as const;",
  ].join("\n");
  assert.deepEqual(i18nStrings(source, "en"), [
    { line: 3, text: "Hello!", key: "a" },
    { line: 4, text: "one", key: undefined },
  ]);
  assert.deepEqual(i18nStrings(source, "de"), [
    { line: 7, text: "Hallo", key: "a" },
  ]);
});

// A quotation shown with its source keeps its author's "wir" (owner,
// 2026-11-06); every other rule still applies to it, and "wir" anywhere else
// still counts — also for a value wrapped onto the line after its key.
test("a quotation waives only the wir rule", () => {
  const source = [
    "const resources = {",
    "  de: {",
    "    primeDirective:",
    '      "Was wir herausfinden — jede:r",',
    '    label: "Was nehmen wir uns vor?",',
    "  },",
    "} as const;",
  ].join("\n");
  const rules = scan(i18nStrings(source, "de"), RULES.de).map((h) => h.rule);
  assert.deepEqual(rules.sort(), ["em-dash", "gender-sign", "wir"]);
});

test("index.html: text and content attributes, without scripts and comments", () => {
  const source = [
    '<meta name="description" content="Retros — kostenlos" />',
    "<!-- nicht das! -->",
    "<script>alert('nicht das!')</script>",
    "<p>Das hier!</p>",
  ].join("\n");
  assert.deepEqual(htmlStrings(source), [
    { line: 1, text: "Retros — kostenlos" },
    { line: 4, text: "Das hier!" },
  ]);
});
