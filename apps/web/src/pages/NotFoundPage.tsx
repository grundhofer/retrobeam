// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { LegalFooter } from "../components/LegalFooter.js";
import { NoIndex } from "../components/NoIndex.js";
import { SiteHeader } from "../components/SiteHeader.js";
import { StateView } from "../components/StateView.js";

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
    <StateView
      view="not-found"
      testId="page-not-found"
      header={
        <>
          <NoIndex />
          <SiteHeader />
        </>
      }
      title={title}
      text={t("pageNotFound.body", { host: location.host })}
      action={
        <Link to="/" className="sb-primary-action">
          {t("pageNotFound.home")}
        </Link>
      }
      footer={<LegalFooter />}
    />
  );
}
