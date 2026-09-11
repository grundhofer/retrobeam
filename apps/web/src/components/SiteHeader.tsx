// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { REPO_URL } from "../content/operator.js";
import { LanguageToggle } from "./LanguageToggle.js";

// The header of every page outside a board: wordmark back to the landing
// page, one text link to the source, the language switch. Nothing else — the
// landing page's one primary action lives in its hero, not up here.
export function SiteHeader() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4 sm:px-10">
      <Link
        to="/"
        aria-current={pathname === "/" ? "page" : undefined}
        className="rounded font-semibold text-zinc-800 focus-visible:outline-2 focus-visible:outline-accent"
      >
        {t("app.name")}
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
        <LanguageToggle />
      </nav>
    </header>
  );
}
