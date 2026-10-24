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
    { line: 3, text: "Hello!" },
    { line: 4, text: "one" },
  ]);
  assert.deepEqual(i18nStrings(source, "de"), [{ line: 7, text: "Hallo" }]);
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
