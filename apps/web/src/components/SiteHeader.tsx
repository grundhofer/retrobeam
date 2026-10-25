// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { REPO_URL } from "../content/operator.js";
import { BrandLogo } from "./BrandLogo.js";
import { LanguageToggle } from "./LanguageToggle.js";

// The header of every page outside a board: wordmark back to the landing
// page, one text link to the source, the language switch. Nothing else — the
// landing page's one primary action lives in its hero, not up here.
//
// `languageTo` is the same page in the other language, for the pages that
// have one (the legal pages): the switch then links there instead of storing
// a choice.
export function SiteHeader({ languageTo }: { languageTo?: string }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  return (
    <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-4 sm:px-10">
      <Link
        to="/"
        aria-current={pathname === "/" ? "page" : undefined}
        className="group rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <BrandLogo />
      </Link>
      <nav className="flex items-center gap-3" aria-label={t("site.nav")}>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="rounded px-2 py-1 text-sm text-zinc-600 underline underline-offset-4 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-accent"
        >
          GitHub
        </a>
        <LanguageToggle to={languageTo} />
      </nav>
    </header>
  );
}
