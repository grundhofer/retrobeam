// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import {
  layoutModes,
  parseTemplateLinkColumns,
  TEMPLATE_KEYS,
  templateKeySchema,
  type LayoutMode,
  type TemplateKey,
} from "@retrobeam/shared";
import { LegalFooter } from "../components/LegalFooter.js";
import { SiteHeader } from "../components/SiteHeader.js";
import { createBoard } from "../lib/api.js";
import { saveAdminToken } from "../lib/session.js";

export function HomePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [name, setName] = useState("");
  // Template links: `?template=<key>` preselects a built-in one, `?columns=A|B`
  // brings somebody's own set. A link is typed, pasted and truncated by chat
  // tools, so nothing in it may break the form — anything unreadable is
  // ignored, with a quiet line saying so rather than a silent swap.
  const linkTemplate = searchParams.get("template");
  const linkTemplateKey = templateKeySchema.safeParse(linkTemplate);
  const linkColumnsRaw = searchParams.get("columns");
  const linkColumns =
    linkColumnsRaw === null ? null : parseTemplateLinkColumns(linkColumnsRaw);
  const [template, setTemplate] = useState<TemplateKey>(() =>
    linkTemplateKey.success ? linkTemplateKey.data : "went-well",
  );
  const [layout, setLayout] = useState<LayoutMode>("columns");
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const title = t("home.title");
  const appName = t("app.name");

  // Same pattern as LegalPage: the tab names the page, in the UI language.
  useEffect(() => {
    document.title = `${title} · ${appName}`;
    return () => {
      document.title = appName;
    };
  }, [appName, title]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || name.trim() === "") return;
    setBusy(true);
    setFailed(false);
    try {
      const locale = i18n.language.startsWith("de") ? "de" : "en";
      const { boardId, adminToken } = await createBoard(
        name.trim(),
        template,
        locale,
        layout,
        anonymous,
        linkColumns ?? undefined,
      );
      saveAdminToken(boardId, adminToken);
      void navigate(`/board/${boardId}`);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-6 pb-24">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-semibold text-zinc-900">
            {t("home.title")}
          </h1>
          {/* What happens after the button, so nobody fills in a form that
              leads to a black box: a link to share, then a lobby to wait in. */}
          <p data-testid="home-next-step" className="mt-1 mb-6 text-zinc-500">
            {t("home.nextStep")}
          </p>
          <form
            onSubmit={(event) => void submit(event)}
            className="flex flex-col gap-4"
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">
                {t("home.boardName")}
              </span>
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("home.boardNamePlaceholder")}
                maxLength={40}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-accent"
              />
            </label>
            {linkColumns !== null ? (
              <div
                data-testid="home-link-columns"
                className="flex flex-col gap-1.5 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2"
              >
                <span className="text-sm text-zinc-700">
                  {t("home.linkColumns", { columns: linkColumns.join(" · ") })}
                </span>
                {/* Dropping them edits the URL too, so a reload keeps the
                    choice instead of bringing the link's columns back. */}
                <button
                  type="button"
                  data-testid="home-link-columns-drop"
                  onClick={() =>
                    setSearchParams(
                      (params) => {
                        params.delete("columns");
                        return params;
                      },
                      { replace: true },
                    )
                  }
                  className="self-start text-sm font-medium text-accent-strong underline hover:no-underline"
                >
                  {t("home.linkColumnsDrop")}
                </button>
              </div>
            ) : (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-zinc-700">
                  {t("home.template")}
                </span>
                <select
                  value={template}
                  onChange={(event) =>
                    setTemplate(event.target.value as typeof template)
                  }
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {TEMPLATE_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {t(`template.${key}.name`)}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-zinc-500">
                  {t(`template.${template}.hint`)}
                </span>
                {linkColumnsRaw !== null ? (
                  <span
                    data-testid="home-link-invalid"
                    className="text-sm text-zinc-500"
                  >
                    {t("home.linkColumnsInvalid")}
                  </span>
                ) : linkTemplate !== null && !linkTemplateKey.success ? (
                  <span
                    data-testid="home-link-invalid"
                    className="text-sm text-zinc-500"
                  >
                    {t("home.linkTemplateInvalid")}
                  </span>
                ) : null}
              </label>
            )}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">
                {t("home.layout")}
              </span>
              <div className="flex gap-2" role="group">
                {layoutModes.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    data-testid={`home-layout-${mode}`}
                    aria-pressed={layout === mode}
                    onClick={() => setLayout(mode)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                      layout === mode
                        ? "border-accent bg-accent/10 text-accent-strong"
                        : "border-zinc-300 text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    {t(`home.layoutMode.${mode}`)}
                  </button>
                ))}
              </div>
              <span className="text-sm text-zinc-500">
                {t(`home.layoutHint.${layout}`)}
              </span>
            </div>
            {/* Offered HERE and nowhere else: anonymity is fixed at creation.
                The hint says so before the box is ticked, not after. */}
            <label className="flex flex-col gap-1.5">
              <span className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                <input
                  type="checkbox"
                  data-testid="home-anonymous"
                  checked={anonymous}
                  onChange={(event) => setAnonymous(event.target.checked)}
                  className="accent-accent"
                />
                {t("home.anonymous")}
              </span>
              <span className="text-sm text-zinc-500">
                {t("home.anonymousHint")}
              </span>
            </label>
            {/* Said before the board exists: whoever creates it on a laptop
                and runs it on the meeting-room PC should know there is a way
                across, not find out once they are standing there without one. */}
            <p
              data-testid="home-admin-link-hint"
              className="text-sm text-zinc-500"
            >
              {t("home.adminLinkHint")}
            </p>
            <button
              type="submit"
              disabled={busy || name.trim() === ""}
              className="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
            >
              {busy ? t("home.creating") : t("home.create")}
            </button>
            {failed ? (
              <p role="alert" className="text-sm text-red-700">
                {t("home.createFailed")}
              </p>
            ) : null}
          </form>
        </div>
      </main>
      <LegalFooter />
    </div>
  );
}
