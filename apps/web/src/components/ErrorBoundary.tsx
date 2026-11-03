// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { isRouteErrorResponse, useRouteError } from "react-router";
import { useTranslation } from "react-i18next";
import { NotFoundPage } from "../pages/NotFoundPage.js";
import { Icon } from "./Icon.js";
import { LegalFooter } from "./LegalFooter.js";
import { MAIN_ID } from "./SkipLink.js";

// Wired as the router's errorElement. Without it, a render exception anywhere
// in the board unmounts the tree and leaves a blank page mid-retro, with the
// board state still safe on the server but no way back to it except the user
// guessing that a reload would help. Board state is server-authoritative and a
// (re)join replays the full snapshot, so reloading really is the recovery.
//
// The router also reports "no such route" and thrown responses through here,
// as plain objects rather than Errors — String() of one is "[object Object]".
// A 404 gets the real not-found page (the catch-all route in main.tsx should
// normally get there first); any other status is shown as status and text.
export function ErrorBoundary() {
  const { t } = useTranslation();
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`.trim()
    : error instanceof Error
      ? error.message
      : String(error ?? "unknown");

  // The failure as sebaro's error callout (spec/02 §3.11): the sentence, the
  // reason as the system wrote it under „Details“ (§3.28), closed at first,
  // and reloading as its action.
  return (
    <div data-sb-view="error" className="flex min-h-dvh flex-col">
      <main
        id={MAIN_ID}
        className="sb-container sb-section flex-1"
        data-testid="error-boundary"
      >
        <div
          className="sb-callout sb-callout--error"
          role="note"
          aria-labelledby="error-title"
        >
          <Icon name="error--filled" size={20} />
          <h1 className="sb-callout__title" id="error-title">
            {t("error.title")}
          </h1>
          <p className="sb-callout__text">{t("error.body")}</p>
          <details className="sb-details">
            <summary>
              <Icon name="chevron-down" size={16} />
              {t("error.details")}
            </summary>
            <samp className="sb-details__text">{detail}</samp>
          </details>
          <div className="sb-callout__actions">
            <button
              type="button"
              onClick={() => location.reload()}
              className="sb-secondary-action sb-secondary-action--compact"
            >
              {t("error.reload")}
            </button>
          </div>
        </div>
      </main>
      <LegalFooter />
    </div>
  );
}
