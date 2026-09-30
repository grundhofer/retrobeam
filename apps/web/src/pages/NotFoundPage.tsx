// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { LegalFooter } from "../components/LegalFooter.js";
import { NoIndex } from "../components/NoIndex.js";
import { SiteHeader } from "../components/SiteHeader.js";

// Every path the router does not know lands here instead of in the
// ErrorBoundary, which used to print "[object Object]" for a mistyped link.
// The likeliest way to get here is a board link that lost its tail in a chat
// client, so the page shows what a whole one looks like — on this host, so a
// self-hosted instance shows its own. The worker still answers 200 (the SPA
// shell is served for every path), so the page marks itself noindex.
//
// /en and /de land here too, deliberately: the UI language follows the
// browser and the toggle, not the path (see main.tsx), and switching it from
// a path would either not survive a reload or write to localStorage without
// a click.
export function NotFoundPage() {
  const { t } = useTranslation();
  const title = t("pageNotFound.title");
  const appName = t("app.name");

  // The heading is a sentence; the tab title drops its full stop.
  useEffect(() => {
    document.title = `${title.replace(/\.$/, "")} · ${appName}`;
    return () => {
      document.title = appName;
    };
  }, [appName, title]);

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50">
      <NoIndex />
      <SiteHeader />
      <main
        data-testid="page-not-found"
        className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-24 text-center"
      >
        <h1 className="text-2xl font-semibold text-zinc-900">{title}</h1>
        <p className="max-w-prose break-words text-zinc-600">
          {t("pageNotFound.body", { host: location.host })}
        </p>
        <Link
          to="/"
          className="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {t("pageNotFound.home")}
        </Link>
      </main>
      <LegalFooter />
    </div>
  );
}
