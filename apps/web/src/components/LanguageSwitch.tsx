// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Fragment, useId } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { setLanguage } from "../i18n.js";

type Lang = "de" | "en";
const LANGS: Lang[] = ["de", "en"];

// sebaro's „DE / EN“ in the site header (spec/03 §6.6, spec/09 §18.2).
//
// With `to` the page has a path per language (the legal pages): both codes
// are links to the same page in their language, the current one marked, and
// following a link stores nothing (sebaro WEB-10).
//
// Without it the language is a stored choice (D102 (50), plan §2.4 F18b): a
// fieldset of two radios, each in the box of a link, the radio invisible
// over it so the arrow keys move between the languages. Choosing switches
// the UI without a reload and stores the choice (i18n.ts). Every group gets a
// radio name of its own, so two groups on one page never become one.
export function LanguageSwitch({ to }: { to?: string | undefined }) {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  const name = useId();
  const current: Lang = i18n.language.startsWith("de") ? "de" : "en";
  if (to) {
    return (
      <span
        className="sb-language-switch"
        role="group"
        aria-label={t("site.language")}
      >
        {LANGS.map((lang, index) => (
          <Fragment key={lang}>
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            <Link
              to={lang === current ? pathname : to}
              lang={lang}
              hrefLang={lang}
              aria-current={lang === current ? "true" : undefined}
            >
              {lang.toUpperCase()}
            </Link>
          </Fragment>
        ))}
      </span>
    );
  }
  return (
    <fieldset
      className="sb-language-switch sb-language-switch--choice"
      data-sb-language-choice
    >
      <legend className="sb-visually-hidden">{t("site.language")}</legend>
      {LANGS.map((lang, index) => (
        <Fragment key={lang}>
          {index > 0 ? <span aria-hidden="true">/</span> : null}
          <label className="sb-language-switch__option">
            <input
              type="radio"
              name={name}
              value={lang}
              checked={lang === current}
              onChange={() => setLanguage(lang)}
            />
            <span lang={lang}>{lang.toUpperCase()}</span>
          </label>
        </Fragment>
      ))}
    </fieldset>
  );
}
