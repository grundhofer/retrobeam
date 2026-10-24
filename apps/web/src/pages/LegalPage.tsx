// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useMemo, type ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { LegalFooter } from "../components/LegalFooter.js";
import { SiteHeader } from "../components/SiteHeader.js";
import { INSTANCE_HOST } from "../content/operator.js";
import type { LegalLanguage, LegalPaths } from "../lib/legalPaths.js";

export interface LegalPageProps {
  /** The language of the path the page was opened at. */
  lang: LegalLanguage;
  /** The page's path in each language, for the switch and hreflang. */
  paths: LegalPaths;
  title: string;
  /** ISO date of the current text version, shown under the title. */
  updated?: string;
  children: ReactNode;
}

// The legal pages have one path per language (F18 in docs/sebaro-umbau.md), and
// the path decides: /privacy is English for a reader whose UI is German. The
// whole page follows it, header and footer included, through a clone of the
// app's i18n instance fixed to that language. A clone shares the translations
// but has a language of its own, so the app's language is neither changed nor
// stored — reading a legal page must write nothing to the device (§25 TDDDG,
// privacy notice §4) — and every page after it is in the reader's language
// again. setLanguage() is the only thing that changes the app's language; it
// would store the choice and flip every other screen too.
//
// <html lang> follows the page and is handed back on leaving (WCAG 3.1.1), and
// the head names both versions for search engines (hreflang, absolute on the
// instance host). No canonical: the one HTML shell answers every path, see
// index.html.
export function LegalPage({ lang, paths, ...layout }: LegalPageProps) {
  const { i18n } = useTranslation();
  const pageI18n = useMemo(
    () => i18n.cloneInstance({ lng: lang }),
    [i18n, lang],
  );

  useEffect(() => {
    const root = document.documentElement;
    const previous = root.lang;
    root.lang = lang;
    return () => {
      root.lang = previous;
    };
  }, [lang]);

  useEffect(() => {
    const links = (["de", "en"] as const).map((hreflang) => {
      const link = document.createElement("link");
      link.rel = "alternate";
      link.hreflang = hreflang;
      link.href = `https://${INSTANCE_HOST}${paths[hreflang]}`;
      document.head.append(link);
      return link;
    });
    return () => {
      for (const link of links) link.remove();
    };
  }, [paths]);

  return (
    <I18nextProvider i18n={pageI18n}>
      <LegalLayout
        languageTo={paths[lang === "de" ? "en" : "de"]}
        {...layout}
      />
    </I18nextProvider>
  );
}

// The reading layout the privacy notice, the imprint and the accessibility
// statement share: the site header, a title, then a 65ch prose column
// (`.legal-prose` in index.css styles the plain HTML the content files
// emit). Same ground, same footer as every other screen, so the click from a
// board into the notice has no jolt.
function LegalLayout({
  languageTo,
  title,
  updated,
  children,
}: Omit<LegalPageProps, "lang" | "paths"> & { languageTo: string }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("de") ? "de-DE" : "en-GB";
  const appName = t("app.name");

  useEffect(() => {
    document.title = `${title} · ${appName}`;
    return () => {
      document.title = appName;
    };
  }, [appName, title]);

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50">
      <SiteHeader languageTo={languageTo} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12 sm:px-10">
        <h1 className="text-3xl font-semibold tracking-tight break-words text-zinc-900 sm:text-4xl">
          {title}
        </h1>
        {updated ? (
          <p className="mt-3 text-sm text-zinc-600 tabular-nums">
            {t("legal.updated")}{" "}
            <time dateTime={updated}>
              {new Date(`${updated}T00:00:00Z`).toLocaleDateString(locale, {
                year: "numeric",
                month: "long",
                day: "numeric",
                timeZone: "UTC",
              })}
            </time>
          </p>
        ) : null}
        <div className="legal-prose mt-6 max-w-prose">{children}</div>
      </main>
      <LegalFooter />
    </div>
  );
}
