// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useId, useRef, useState } from "react";
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
import { Icon } from "../components/Icon.js";
import { LegalFooter } from "../components/LegalFooter.js";
import { SiteHeader } from "../components/SiteHeader.js";
import { MAIN_ID } from "../components/SkipLink.js";
import { createBoard } from "../lib/api.js";
import { saveAdminToken } from "../lib/session.js";
import { useMissingField } from "../lib/useMissingField.js";

export function HomePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [name, setName] = useState("");
  // An empty name does not grey the button out (sebaro STA-03): the press
  // says so at the field and puts the cursor there instead.
  const nameField = useMissingField();
  // Template links: `?template=<key>` preselects a built-in one, `?columns=A|B`
  // brings somebody's own set. A link is typed, pasted and truncated by chat
  // tools, so nothing in it may break the form — anything unreadable is
  // ignored, with a quiet line saying so rather than a silent swap.
  const linkTemplate = searchParams.get("template");
  const linkTemplateKey = templateKeySchema.safeParse(linkTemplate);
  const linkColumnsRaw = searchParams.get("columns");
  const linkColumns =
    linkColumnsRaw === null ? null : parseTemplateLinkColumns(linkColumnsRaw);
  // The drop button removes itself, so focus would fall to <body>. It moves
  // to the picker that takes its place instead — only after a drop, never
  // on load, where the name field keeps its autofocus.
  const templateSelectRef = useRef<HTMLSelectElement>(null);
  const focusPickerAfterDrop = useRef(false);
  useEffect(() => {
    if (linkColumnsRaw !== null || !focusPickerAfterDrop.current) return;
    focusPickerAfterDrop.current = false;
    templateSelectRef.current?.focus();
  }, [linkColumnsRaw]);
  const [template, setTemplate] = useState<TemplateKey>(() =>
    linkTemplateKey.success ? linkTemplateKey.data : "went-well",
  );
  const [layout, setLayout] = useState<LayoutMode>("columns");
  const [anonymous, setAnonymous] = useState(false);
  const templateId = useId();
  const layoutName = useId();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const title = t("home.title");
  const appName = t("app.name");

  // The tab names the page, in the UI language.
  useEffect(() => {
    document.title = `${title} · ${appName}`;
    return () => {
      document.title = appName;
    };
  }, [appName, title]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (name.trim() === "") {
      // Nothing was sent on this press, so an earlier failure no longer
      // stands next to the message.
      setFailed(false);
      nameField.report();
      return;
    }
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

  // sebaro's form (spec/02 §2): label over field, the grid one column wide at
  // this width, the primary action last. It is never disabled: an empty name
  // is answered at the field (STA-03), a press while it works shows the
  // progress in the button, and a failure stands before the button, which
  // then reads „Noch mal versuchen“ (spec/02 §1.1). The line under it says
  // where the board goes (BEL-10, F20).
  return (
    <div data-sb-view="new-board" className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id={MAIN_ID} className="sb-container sb-section flex-1">
        <div className="mx-auto max-w-md">
          <h1>{t("home.title")}</h1>
          {/* What happens after the button, so nobody fills in a form that
              leads to a black box: a link to share, then a lobby to wait in. */}
          <p
            data-testid="home-next-step"
            className="mt-(--sb-space-2) mb-(--sb-space-8) text-(--sb-color-text-muted)"
          >
            {t("home.nextStep")}
          </p>
          <form
            className="sb-form-grid"
            onSubmit={(event) => void submit(event)}
          >
            <div className="sb-field sb-form-grid__wide">
              <label
                className="sb-field__label"
                htmlFor={nameField.fieldProps.id}
              >
                {t("home.boardName")}
              </label>
              <div className="sb-field__control">
                <input
                  {...nameField.fieldProps}
                  type="text"
                  autoFocus
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    nameField.typed(event.target.value);
                  }}
                  placeholder={t("home.boardNamePlaceholder")}
                  maxLength={40}
                  autoComplete="off"
                />
              </div>
              {nameField.missing ? (
                <p className="sb-field__error" id={nameField.messageId}>
                  <Icon name="error--filled-16" size={16} />
                  {t("home.boardNameMissing")}
                </p>
              ) : null}
              {/* Mounted from the start: a region inserted together with its
                  text is not reliably announced. */}
              <p role="status" className="sb-visually-hidden">
                {nameField.spoken ? t("home.boardNameMissing") : ""}
              </p>
            </div>
            {linkColumns !== null ? (
              <div
                data-testid="home-link-columns"
                className="sb-callout sb-callout--note sb-form-grid__wide"
                role="note"
              >
                <Icon name="info--filled" size={20} />
                <p className="sb-callout__text">
                  {t("home.linkColumns", { columns: linkColumns.join(" · ") })}
                </p>
                {/* Dropping them edits the URL too, so a reload keeps the
                    choice instead of bringing the link's columns back. */}
                <div className="sb-callout__actions">
                  <button
                    type="button"
                    data-testid="home-link-columns-drop"
                    className="sb-text-action"
                    onClick={() => {
                      focusPickerAfterDrop.current = true;
                      setSearchParams(
                        (params) => {
                          params.delete("columns");
                          return params;
                        },
                        { replace: true },
                      );
                    }}
                  >
                    {t("home.linkColumnsDrop")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="sb-field sb-form-grid__wide">
                <label className="sb-field__label" htmlFor={templateId}>
                  {t("home.template")}
                </label>
                <div className="sb-field__control sb-select">
                  <select
                    id={templateId}
                    ref={templateSelectRef}
                    value={template}
                    aria-describedby={`${templateId}-help`}
                    onChange={(event) =>
                      setTemplate(event.target.value as typeof template)
                    }
                  >
                    {TEMPLATE_KEYS.map((key) => (
                      <option key={key} value={key}>
                        {t(`template.${key}.name`)}
                      </option>
                    ))}
                  </select>
                  <Icon name="chevron-down" />
                </div>
                <p className="sb-field__help" id={`${templateId}-help`}>
                  <span>{t(`template.${template}.hint`)}</span>
                </p>
                {linkColumnsRaw !== null ? (
                  <p data-testid="home-link-invalid" className="sb-field__help">
                    <span>{t("home.linkColumnsInvalid")}</span>
                  </p>
                ) : linkTemplate !== null && !linkTemplateKey.success ? (
                  <p data-testid="home-link-invalid" className="sb-field__help">
                    <span>{t("home.linkTemplateInvalid")}</span>
                  </p>
                ) : null}
              </div>
            )}
            <fieldset className="sb-segmented sb-form-grid__wide">
              <legend>{t("home.layout")}</legend>
              <div className="sb-segmented__options">
                {layoutModes.map((mode) => (
                  <label
                    key={mode}
                    className="sb-segmented__option"
                    data-testid={`home-layout-${mode}`}
                  >
                    <input
                      type="radio"
                      name={layoutName}
                      value={mode}
                      checked={layout === mode}
                      onChange={() => setLayout(mode)}
                    />
                    <span className="sb-segmented__face">
                      <Icon name="check" size={16} />
                      {t(`home.layoutMode.${mode}`)}
                    </span>
                  </label>
                ))}
              </div>
              <p className="sb-field__help">
                <span>{t(`home.layoutHint.${layout}`)}</span>
              </p>
            </fieldset>
            {/* Offered HERE and nowhere else: anonymity is fixed at creation.
                The hint says so before the box is ticked, not after. */}
            <div className="sb-field sb-form-grid__wide">
              <label className="sb-checkbox">
                <input
                  type="checkbox"
                  data-testid="home-anonymous"
                  checked={anonymous}
                  aria-describedby={`${templateId}-anonymous-help`}
                  onChange={(event) => setAnonymous(event.target.checked)}
                />
                <span>{t("home.anonymous")}</span>
              </label>
              <p className="sb-field__help" id={`${templateId}-anonymous-help`}>
                <span>{t("home.anonymousHint")}</span>
              </p>
            </div>
            {/* Said before the board exists: whoever creates it on a laptop
                and runs it on the meeting-room PC should know there is a way
                across, not find out once they are standing there without one. */}
            <p
              data-testid="home-admin-link-hint"
              className="sb-form-grid__wide text-(--sb-color-text-muted)"
            >
              {t("home.adminLinkHint")}
            </p>
            <div className="sb-form-grid__actions">
              {failed ? (
                <p className="sb-form-grid__message" role="alert">
                  <Icon name="error" size={16} />
                  {t("home.createFailed")}
                </p>
              ) : null}
              <button
                type="submit"
                className="sb-primary-action"
                aria-busy={busy || undefined}
                data-sb-progress={busy ? "indeterminate" : undefined}
                data-sb-state={failed ? "retry" : undefined}
              >
                <span className="sb-primary-action__label">
                  {busy
                    ? t("home.creating")
                    : failed
                      ? t("home.retry")
                      : t("home.create")}
                </span>
                <i className="sb-primary-action__bar" aria-hidden="true" />
              </button>
              <p className="sb-action-hint">{t("home.dataPath")}</p>
            </div>
          </form>
        </div>
      </main>
      <LegalFooter />
    </div>
  );
}
