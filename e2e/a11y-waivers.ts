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

export const waivers: Waiver[] = [];
