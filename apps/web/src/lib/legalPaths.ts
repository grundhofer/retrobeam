// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

// The legal pages have one path per language (F18 in docs/sebaro-umbau.md):
// the path decides the language, not the stored UI language. The routes in
// main.tsx, the footer (the version in the reader's language) and a legal
// page's language switch and hreflang (its counterpart) all read the pairs from
// here, so a link cannot drift from its route.
export type LegalLanguage = "de" | "en";

export const LEGAL_PATHS = {
  privacy: { de: "/datenschutz", en: "/privacy" },
  imprint: { de: "/impressum", en: "/imprint" },
} as const satisfies Record<string, Record<LegalLanguage, string>>;

export type LegalPaths = (typeof LEGAL_PATHS)[keyof typeof LEGAL_PATHS];
