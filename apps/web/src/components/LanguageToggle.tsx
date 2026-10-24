// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { setLanguage } from "../i18n.js";

const className =
  "rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-accent";

// The switch shows the code of the other language. Its name starts with that
// code, so a voice-control user can say what they see (WCAG 2.5.3), then says
// what it does in the language it switches to — hence `lang` on the element,
// so a screen reader reads it in that language (WCAG 3.1.2).
//
// With `to` it is a link to the same page in the other language (sebaro
// WEB-10): the legal pages have one path per language, so switching there is
// following that path and stores nothing. Without it — on every page with no
// language in its URL (F18b) — it stays the button that changes and stores
// the UI language.
export function LanguageToggle({ to }: { to?: string | undefined }) {
  const { i18n } = useTranslation();
  const current = i18n.language.startsWith("de") ? "de" : "en";
  const next = current === "de" ? "en" : "de";
  const label =
    next === "de" ? "DE, auf Deutsch umschalten" : "EN, switch to English";
  if (to) {
    return (
      <Link
        to={to}
        lang={next}
        hrefLang={next}
        className={className}
        aria-label={label}
      >
        {next.toUpperCase()}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setLanguage(next)}
      lang={next}
      className={className}
      aria-label={label}
    >
      {next.toUpperCase()}
    </button>
  );
}
