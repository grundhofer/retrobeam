// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useRouteError } from "react-router";
import { useTranslation } from "react-i18next";
import { LegalFooter } from "./LegalFooter.js";

// Wired as the router's errorElement. Without it, a render exception anywhere
// in the board unmounts the tree and leaves a blank page mid-retro, with the
// board state still safe on the server but no way back to it except the user
// guessing that a reload would help. Board state is server-authoritative and a
// (re)join replays the full snapshot, so reloading really is the recovery.
export function ErrorBoundary() {
  const { t } = useTranslation();
  const error = useRouteError();
  const detail =
    error instanceof Error ? error.message : String(error ?? "unknown");

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50">
      <main
        className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
        data-testid="error-boundary"
      >
        <h1 className="text-2xl font-semibold text-zinc-900">
          {t("error.title")}
        </h1>
        <p className="max-w-prose text-zinc-500">{t("error.body")}</p>
        <button
          type="button"
          onClick={() => location.reload()}
          className="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {t("error.reload")}
        </button>
        <p className="max-w-prose font-mono text-xs break-all text-zinc-600">
          {detail}
        </p>
      </main>
      <LegalFooter />
    </div>
  );
}
