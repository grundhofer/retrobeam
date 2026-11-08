// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  EXPORT_DOWNLOADS,
  EXPORT_SCOPES,
  TEMPLATE_LINK_MAX_COLUMNS,
  templateLinkQuery,
  type Column,
} from "@retrobeam/shared";
import { useConnection } from "../lib/connection.js";
import { loadAdminToken } from "../lib/session.js";
import { useBoardCopy } from "../lib/useBoardCopy.js";
import { useBoardExport } from "../lib/useBoardExport.js";
import { AdminLink } from "./AdminLink.js";
import { Dialog } from "./Dialog.js";
import { Icon } from "./Icon.js";
import { Menu, type MenuItem } from "./Menu.js";

// sebaro's menu „Mehr“ (spec/02 §4.10) in the board's head: export for
// everyone; for the facilitator the facilitator link, follow-up, duplicate,
// template link, and „Board löschen …“ last after a hairline. The board's
// switches are in the settings view (BoardSettings). The picker SKIN
// deliberately is not here — it sits next to the spin button in the
// presenting cockpit, where it is used; one setting, one control.
//
// Rows that need more than a click open a dialog of their own, their label
// ending in „…“ (D105 (40)): export, whose data path stands under its keys
// there, never as a second line of a menu row; the facilitator link and the
// template link, which show a link; and the deletion, which asks first.
type Open = "export" | "adminLink" | "templateLink" | "delete" | null;

export function BoardMenu({
  boardId,
  boardName,
  isAdmin,
  anonymous,
  columns,
}: {
  boardId: string;
  boardName: string;
  isAdmin: boolean;
  anonymous: boolean;
  columns: readonly Column[];
}) {
  const { t } = useTranslation();
  const { send } = useConnection();
  const [open, setOpen] = useState<Open>(null);
  const { copying, failed: copyFailed, copy } = useBoardCopy(boardId);
  // Same rule as the lobby: the token holder, while it still counts here.
  const adminToken = isAdmin ? loadAdminToken(boardId) : null;
  const close = () => setOpen(null);

  const items: MenuItem[] = [
    {
      key: "export",
      label: t("menu.exportOpen"),
      icon: "download",
      testId: "export-open",
      onSelect: () => setOpen("export"),
    },
  ];
  // In every phase, not just the lobby: the moment someone needs to move the
  // retro to another screen is usually mid-retro.
  if (adminToken !== null) {
    items.push({
      key: "adminLink",
      label: t("menu.adminLinkOpen"),
      icon: "lock",
      testId: "admin-link-open",
      onSelect: () => setOpen("adminLink"),
    });
  }
  if (isAdmin) {
    // Both need the admin token itself, not just the role: a co-facilitator
    // promoted in the room holds no token, and the server would refuse them.
    if (adminToken !== null) {
      items.push(
        {
          key: "followUp",
          label: t("menu.followUp"),
          icon: "repeat",
          testId: "follow-up-board",
          disabled: copying !== null,
          onSelect: () =>
            void copy("follow-up", t("menu.followUpName", { name: boardName })),
        },
        {
          key: "duplicate",
          label: t("menu.duplicate"),
          icon: "copy",
          testId: "duplicate-board",
          disabled: copying !== null,
          onSelect: () =>
            void copy(
              "duplicate",
              t("menu.duplicateName", { name: boardName }),
            ),
        },
      );
    }
    items.push(
      {
        key: "templateLink",
        label: t("menu.templateLinkOpen"),
        icon: "link",
        testId: "template-link-open",
        onSelect: () => setOpen("templateLink"),
      },
      {
        key: "delete",
        label: t("menu.deleteOpen"),
        icon: "trash",
        danger: true,
        separatorBefore: true,
        testId: "delete-board",
        onSelect: () => setOpen("delete"),
      },
    );
  }

  const closeKey = (
    <button type="button" className="sb-secondary-action" onClick={close}>
      {t("menu.close")}
    </button>
  );

  return (
    <>
      <Menu
        label={t("menu.more")}
        items={items}
        triggerTestId="board-menu"
        menuTestId="board-menu-panel"
      />
      {copyFailed ? (
        <p role="alert" className="sb-field__error">
          <Icon name="error" size={16} />
          <span>{t("menu.copyFailed")}</span>
        </p>
      ) : null}

      <Dialog
        open={open === "export"}
        onClose={close}
        title={t("menu.exportTitle")}
        testId="export-dialog"
        actions={closeKey}
      >
        {open === "export" ? (
          <ExportBody boardId={boardId} anonymous={anonymous} />
        ) : null}
      </Dialog>

      {adminToken !== null ? (
        <Dialog
          open={open === "adminLink"}
          onClose={close}
          title={t("menu.adminLinkTitle")}
          actions={closeKey}
        >
          {open === "adminLink" ? (
            <AdminLink boardId={boardId} adminToken={adminToken} />
          ) : null}
        </Dialog>
      ) : null}

      {isAdmin ? (
        <Dialog
          open={open === "templateLink"}
          onClose={close}
          title={t("menu.templateLinkTitle")}
          actions={closeKey}
        >
          {open === "templateLink" ? (
            <TemplateLinkButton columns={columns} />
          ) : null}
        </Dialog>
      ) : null}

      {/* Deleting wipes the board for everyone and cannot be undone, so it
          asks in sebaro's confirmation dialog (spec/02 §4.6): „Abbrechen“
          first and focused, „Löschen“ last as the outlined danger action
          with the trash. The dialog is modal, so a double click on the menu
          row never lands on the confirmation. */}
      {isAdmin ? (
        <Dialog
          open={open === "delete"}
          onClose={close}
          title={t("menu.deleteTitle")}
          testId="delete-dialog"
          actions={
            <>
              <button
                type="button"
                autoFocus
                className="sb-secondary-action"
                onClick={close}
              >
                {t("note.cancel")}
              </button>
              <button
                type="button"
                data-testid="delete-board-confirm"
                className="sb-danger-action sb-danger-action--outlined"
                onClick={() => {
                  close();
                  send({ type: "admin.board.delete" });
                }}
              >
                <Icon name="trash" size={20} />
                {t("menu.deleteConfirm")}
              </button>
            </>
          }
        >
          <p className="sb-dialog__text">
            {t("menu.deleteText", { name: boardName })}
          </p>
        </Dialog>
      ) : null}
    </>
  );
}

// The export: its scope, whether names go in, and the formats. Every format
// is its own key, so the data path stands once under them (D105 (40)).
function ExportBody({
  boardId,
  anonymous,
}: {
  boardId: string;
  anonymous: boolean;
}) {
  const { t } = useTranslation();
  const scopeName = useId();
  const hintId = useId();
  const {
    scope,
    setScope,
    includeAuthors,
    setIncludeAuthors,
    includeGifs,
    setIncludeGifs,
    imaging,
    imageFailed,
    downloadImage,
    exportHref,
  } = useBoardExport(boardId);
  return (
    <div className="sb-stack">
      <fieldset className="sb-segmented">
        <legend>{t("menu.exportScope")}</legend>
        <div className="sb-segmented__options">
          {EXPORT_SCOPES.map((value) => (
            <label key={value} className="sb-segmented__option">
              <input
                type="radio"
                name={scopeName}
                value={value}
                checked={scope === value}
                data-testid={`export-scope-${value}`}
                onChange={() => setScope(value)}
              />
              <span className="sb-segmented__face">
                <Icon name="check" size={16} />
                {t(`menu.scope.${value}`)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {/* §6.1 e: names off when the dialog opens, and on an anonymous board
          no option to put them in at all — the server leaves them out there
          whatever is asked, and the sentence says so. */}
      {anonymous ? (
        <p className="sb-field__help">{t("menu.includeAuthorsAnonymous")}</p>
      ) : (
        <label className="sb-checkbox">
          <input
            type="checkbox"
            checked={includeAuthors}
            onChange={(event) => setIncludeAuthors(event.target.checked)}
          />
          <span>{t("menu.includeAuthors")}</span>
        </label>
      )}
      <label className="sb-checkbox">
        <input
          type="checkbox"
          data-testid="export-include-gifs"
          checked={includeGifs}
          onChange={(event) => setIncludeGifs(event.target.checked)}
        />
        <span>{t("menu.includeGifs")}</span>
      </label>
      <div role="group" aria-label={t("menu.exportFormat")}>
        <div className="sb-cluster">
          {EXPORT_DOWNLOADS.map((format) =>
            // JPEG is not a link: the Worker cannot encode an image, so the
            // browser draws it from the very same export JSON these links
            // download. Everything else is a plain <a download> and the
            // browser does the work.
            format === "jpeg" ? (
              <button
                key={format}
                type="button"
                data-testid="export-jpeg"
                aria-describedby={hintId}
                aria-busy={imaging || undefined}
                onClick={() => void downloadImage()}
                className="sb-secondary-action"
              >
                {imaging ? t("menu.rendering") : "JPEG"}
              </button>
            ) : (
              <a
                key={format}
                href={exportHref(format)}
                download
                data-testid={`export-${format}`}
                aria-describedby={hintId}
                className="sb-secondary-action"
              >
                {format.toUpperCase()}
              </a>
            ),
          )}
        </div>
        <p id={hintId} className="sb-action-hint">
          {t("menu.exportHint")}
        </p>
      </div>
      {imageFailed ? (
        <p role="alert" className="sb-field__error">
          <Icon name="error" size={16} />
          <span>{t("menu.imageFailed")}</span>
        </p>
      ) : null}
    </div>
  );
}

// The board's format as a /new link another team can start from. Built from
// the VISIBLE column names only: a staged column is the facilitator's surprise
// for later in this retro, and a link pasted into a wiki would give it away.
// Nothing else goes in — no cards, no board id, no names.
function TemplateLinkButton({ columns }: { columns: readonly Column[] }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const names = columns
    .filter((column) => !column.hidden)
    .toSorted((a, b) => a.order - b.order)
    .map((column) => column.name);
  const tooMany = names.length > TEMPLATE_LINK_MAX_COLUMNS;

  async function copy() {
    const url = `${location.origin}/new${templateLinkQuery(names)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (non-secure origin) — show the link to copy
      // by hand, as ShareLink and AdminLink do.
      setFallbackUrl(url);
    }
  }

  return (
    <div className="sb-stack">
      {/* A locked key says why, as the voter-names switch does. */}
      <p className="sb-dialog__text">
        {names.length === 0
          ? t("menu.templateLinkNoVisible")
          : tooMany
            ? t("menu.templateLinkTooMany", { max: TEMPLATE_LINK_MAX_COLUMNS })
            : t("menu.templateLinkHint")}
      </p>
      <p>
        <button
          type="button"
          data-testid="template-link-copy"
          disabled={names.length === 0 || tooMany}
          onClick={() => void copy()}
          className="sb-secondary-action"
        >
          <Icon name="copy" size={20} />
          {copied ? t("board.copied") : t("menu.templateLink")}
        </button>
      </p>
      {fallbackUrl !== null ? (
        <div className="sb-field__control">
          <input
            readOnly
            autoFocus
            data-testid="template-link-input"
            aria-label={t("menu.templateLink")}
            value={fallbackUrl}
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      ) : null}
    </div>
  );
}
