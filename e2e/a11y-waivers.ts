// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

// Documented exceptions for e2e/a11y.spec.ts, in the sebaro guide's format:
// the view, the axe rule id, a substring of the node's target, and why. An
// entry is either a finding from before the sebaro move, removed with the
// stage that rebuilds its view (docs/sebaro-umbau.md §6), or a trade-off that
// went against accessibility under sebaro D103 (accessibility loses when it
// is weighed against another goal); that kind of entry names D103 and what
// accessibility was weighed against.
export type Waiver = {
  page: string;
  rule: string;
  target: string;
  reason: string;
};

export const waivers: Waiver[] = [
  {
    page: "board-canvas-arrange",
    rule: "target-size",
    target: 'aria-label="Move or stack"',
    reason:
      "A canvas card's ⋯. Drawn inside the canvas's zoomed world, so at the fitted zoom (about half size on a desktop, a quarter on a phone) it is under 24px and closer than 24px to its neighbours (WCAG 2.5.8). Found by the canvas's first audit (2026-10-25), older than it; rebuilt with BoardCanvas in stage 5h. The ⋯ panel it opens is drawn at full size.",
  },
  {
    page: "board-canvas-arrange",
    rule: "target-size",
    target: 'aria-label="Edit note"',
    reason:
      "A canvas card's ✎. Drawn inside the canvas's zoomed world, so at the fitted zoom (about half size on a desktop, a quarter on a phone) it is under 24px and closer than 24px to its neighbours (WCAG 2.5.8). Found by the canvas's first audit (2026-10-25), older than it; rebuilt with BoardCanvas in stage 5h.",
  },
  {
    page: "board-canvas-arrange",
    rule: "target-size",
    target: 'aria-label="Delete note"',
    reason:
      "A canvas card's 🗑. Drawn inside the canvas's zoomed world, so at the fitted zoom (about half size on a desktop, a quarter on a phone) it is under 24px and closer than 24px to its neighbours (WCAG 2.5.8). Found by the canvas's first audit (2026-10-25), older than it; rebuilt with BoardCanvas in stage 5h.",
  },
  {
    page: "board-canvas-arrange",
    rule: "target-size",
    target: 'data-testid="canvas-add-note"',
    reason:
      "A zone's \"+ Note\". Drawn inside the canvas's zoomed world, so at the fitted zoom (about half size on a desktop, a quarter on a phone) it is under 24px and closer than 24px to its neighbours (WCAG 2.5.8). Found by the canvas's first audit (2026-10-25), older than it; rebuilt with BoardCanvas in stage 5h.",
  },
];
