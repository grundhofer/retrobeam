// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LegalFooter } from "../components/LegalFooter.js";
import { SiteHeader } from "../components/SiteHeader.js";

export interface LegalPageProps {
  title: string;
  /** ISO date of the current text version, shown under the title. */
  updated?: string;
  children: ReactNode;
}

// The reading layout the privacy notice and the imprint share: the site
// header, a title, then a 65ch prose column (`.legal-prose` in index.css
// styles the plain HTML the content files emit). Same ground, same footer as
// every other screen, so the click from a board into the notice has no jolt.
export function LegalPage({ title, updated, children }: LegalPageProps) {
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
      <SiteHeader />
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
