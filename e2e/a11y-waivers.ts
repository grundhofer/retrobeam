// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

// Documented exceptions for e2e/a11y.spec.ts, in the sebaro guide's format:
// the view, the axe rule id, a substring of the node's target, and why. Each
// entry here is a finding from before the sebaro move; it is removed with the
// stage that rebuilds its view (docs/sebaro-umbau.md §6), never widened.
export type Waiver = {
  page: string;
  rule: string;
  target: string;
  reason: string;
};

export const waivers: Waiver[] = [
  {
    page: "landing",
    rule: "label-content-name-mismatch",
    target: 'aria-label="Auf Deutsch umschalten"',
    reason:
      'The language toggle shows DE/EN but is named "Auf Deutsch umschalten" (WCAG 2.5.3). It is rebuilt with the language choice in stage 3a (F18b).',
  },
  {
    page: "new-board",
    rule: "label-content-name-mismatch",
    target: 'aria-label="Auf Deutsch umschalten"',
    reason:
      'The language toggle shows DE/EN but is named "Auf Deutsch umschalten" (WCAG 2.5.3). It is rebuilt with the language choice in stage 3a (F18b).',
  },
  {
    page: "impressum",
    rule: "label-content-name-mismatch",
    target: 'aria-label="Auf Deutsch umschalten"',
    reason:
      'The language toggle shows DE/EN but is named "Auf Deutsch umschalten" (WCAG 2.5.3). It is rebuilt with the language choice in stage 3a (F18b).',
  },
  {
    page: "datenschutz",
    rule: "label-content-name-mismatch",
    target: 'aria-label="Auf Deutsch umschalten"',
    reason:
      'The language toggle shows DE/EN but is named "Auf Deutsch umschalten" (WCAG 2.5.3). It is rebuilt with the language choice in stage 3a (F18b).',
  },
  {
    page: "not-found",
    rule: "label-content-name-mismatch",
    target: 'aria-label="Auf Deutsch umschalten"',
    reason:
      'The language toggle shows DE/EN but is named "Auf Deutsch umschalten" (WCAG 2.5.3). It is rebuilt with the language choice in stage 3a (F18b).',
  },
  {
    page: "board-lobby",
    rule: "label-content-name-mismatch",
    target: 'aria-label="Auf Deutsch umschalten"',
    reason:
      'The language toggle shows DE/EN but is named "Auf Deutsch umschalten" (WCAG 2.5.3). It is rebuilt with the language choice in stage 3a (F18b).',
  },
  {
    page: "board-write",
    rule: "label-content-name-mismatch",
    target: 'aria-label="Auf Deutsch umschalten"',
    reason:
      'The language toggle shows DE/EN but is named "Auf Deutsch umschalten" (WCAG 2.5.3). It is rebuilt with the language choice in stage 3a (F18b).',
  },
  {
    page: "landing",
    rule: "color-contrast",
    target: "Why RetroBeam",
    reason:
      "zinc-500 small caps on the tinted band fall short of 4.5:1. The landing is rebuilt in stage 4, without eyebrows and uppercase (spec/07 §3 rule 7).",
  },
];
