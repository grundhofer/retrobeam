// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CURSORS_ACTIVATABLE,
  EXPORT_DOWNLOADS,
  EXPORT_SCOPES,
  layoutModes,
  TEMPLATE_LINK_MAX_COLUMNS,
  templateLinkQuery,
  type Column,
  type LayoutMode,
  type Phase,
} from "@retrobeam/shared";
import { useConnection } from "../lib/connection.js";
import { loadAdminToken } from "../lib/session.js";
import { useBoardCopy } from "../lib/useBoardCopy.js";
import { useBoardExport } from "../lib/useBoardExport.js";
import { AdminLink } from "./AdminLink.js";
import { HeaderPopover } from "./HeaderPopover.js";

// Export (anyone) + admin board settings: GIF toggle, layout, duplicate, keep,
// delete-now. Lives in the board header. The picker SKIN deliberately is not
// here — it sits next to the spin button in the presenting cockpit, where it is
// used; one setting, one control.
export function BoardMenu({
  boardId,
  boardName,
  isAdmin,
  gifsEnabled,
  cursorsEnabled,
  voterNamesEnabled,
  anonymous,
  phase,
  layout,
  retentionAt,
  columns,
}: {
  boardId: string;
  boardName: string;
  isAdmin: boolean;
  gifsEnabled: boolean;
  cursorsEnabled: boolean;
  voterNamesEnabled: boolean;
  anonymous: boolean;
  phase: Phase;
  layout: LayoutMode;
  retentionAt: number | null;
  columns: readonly Column[];
}) {
  const { t } = useTranslation();
  const { send } = useConnection();
  const [open, setOpen] = useState(false);
  const {
    scope,
    setScope,
    includeAuthors,
    setIncludeAuthors,
    imaging,
    imageFailed,
    downloadImage,
    exportHref,
  } = useBoardExport(boardId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { copying, failed: copyFailed, copy } = useBoardCopy(boardId);
  // Same rule as the lobby: the token holder, while it still counts here.
  const adminToken = isAdmin ? loadAdminToken(boardId) : null;

  return (
    <HeaderPopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirmingDelete(false);
      }}
      title={t("menu.title")}
      trigger="⋯"
      triggerTestId="board-menu"
      triggerAriaLabel={t("menu.title")}
      triggerClassName="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-accent"
      panelTestId="board-menu-panel"
      panelWidth={{ className: "sm:w-64", px: 256 }}
    >
      <div>
        <p className="mb-1.5 font-semibold tracking-wide text-zinc-500 uppercase">
          {t("menu.export")}
        </p>
        <div className="mb-2">
          <p className="mb-1 text-zinc-600">{t("menu.exportScope")}</p>
          <div className="flex gap-1.5" role="group">
            {EXPORT_SCOPES.map((value) => (
              <button
                key={value}
                type="button"
                data-testid={`export-scope-${value}`}
                aria-pressed={scope === value}
                onClick={() => setScope(value)}
                className={`flex-1 rounded-lg border px-2 py-1 text-xs font-medium ${
                  scope === value
                    ? "border-accent bg-accent/10 text-accent-strong"
                    : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {t(`menu.scope.${value}`)}
              </button>
            ))}
          </div>
        </div>
        <label className="mb-2 flex items-center gap-1.5 text-zinc-600">
          <input
            type="checkbox"
            checked={includeAuthors}
            onChange={(event) => setIncludeAuthors(event.target.checked)}
            className="accent-accent"
          />
          {t("menu.includeAuthors")}
        </label>
        {/* The server leaves them out whatever this box says; say so, so
                the box cannot be read as a way to get them back. */}
        {anonymous ? (
          <p className="-mt-1 mb-2 text-xs text-zinc-400">
            {t("menu.includeAuthorsAnonymous")}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
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
                disabled={imaging}
                onClick={() => void downloadImage()}
                className="rounded-lg border border-zinc-200 px-3 py-1 font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {imaging ? t("menu.rendering") : "JPEG"}
              </button>
            ) : (
              <a
                key={format}
                href={exportHref(format)}
                download
                data-testid={`export-${format}`}
                className="rounded-lg border border-zinc-200 px-3 py-1 font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {format.toUpperCase()}
              </a>
            ),
          )}
        </div>
        {imageFailed ? (
          <p className="mt-1.5 text-xs text-red-700">{t("menu.imageFailed")}</p>
        ) : null}
      </div>

      {/* In every phase, not just the lobby: the moment someone needs to
              move the retro to another screen is usually mid-retro. */}
      {adminToken !== null ? (
        <div className="border-t border-zinc-100 pt-3">
          <AdminLink boardId={boardId} adminToken={adminToken} compact />
        </div>
      ) : null}

      {isAdmin ? (
        <div className="border-t border-zinc-100 pt-3">
          <p className="mb-1.5 font-semibold tracking-wide text-zinc-500 uppercase">
            {t("menu.settings")}
          </p>
          <label className="mb-2 flex items-center gap-1.5 text-zinc-600">
            <input
              type="checkbox"
              checked={gifsEnabled}
              data-testid="gifs-toggle"
              onChange={(event) =>
                send({
                  type: "admin.gifs.set",
                  enabled: event.target.checked,
                })
              }
              className="accent-accent"
            />
            {t("menu.gifsEnabled")}
          </label>
          {/* Whether the reveal names the voters. Disabled rather than
                  hidden once voting has closed: the lock is part of the
                  promise — nobody may be de-blinded in a round they already
                  voted in — and a control that silently vanishes teaches
                  nothing. The server refuses it either way. */}
          <label className="mb-2 flex items-center gap-1.5 text-zinc-600">
            <input
              type="checkbox"
              checked={voterNamesEnabled && !anonymous}
              // The lock is one-way, exactly like the server's: after the
              // reveal you may still take names down, never put them up.
              disabled={
                anonymous || (voterNamesLocked(phase) && !voterNamesEnabled)
              }
              data-testid="voter-names-toggle"
              onChange={(event) =>
                send({
                  type: "admin.voterNames.set",
                  enabled: event.target.checked,
                })
              }
              className="accent-accent"
            />
            {t("menu.voterNamesEnabled")}
          </label>
          {anonymous || (voterNamesLocked(phase) && !voterNamesEnabled) ? (
            <p className="-mt-1 mb-2 text-xs text-zinc-400">
              {anonymous
                ? t("menu.voterNamesAnonymous")
                : t("menu.voterNamesLocked")}
            </p>
          ) : null}
          {/* Kept behind one emergency feature gate even though the 1 Hz
                  client throttle and daily server budget normally make it safe. */}
          {CURSORS_ACTIVATABLE ? (
            <label className="mb-2 flex items-center gap-1.5 text-zinc-600">
              <input
                type="checkbox"
                checked={cursorsEnabled && !anonymous}
                // Refused by the server on an anonymous board, like voter
                // names — disabled with the reason rather than hidden.
                disabled={anonymous}
                data-testid="cursors-toggle"
                onChange={(event) =>
                  send({
                    type: "admin.cursors.set",
                    enabled: event.target.checked,
                  })
                }
                className="accent-accent"
              />
              {t("menu.cursorsEnabled")}
            </label>
          ) : null}
          {CURSORS_ACTIVATABLE && anonymous ? (
            <p className="-mt-1 mb-2 text-xs text-zinc-400">
              {t("menu.cursorsAnonymous")}
            </p>
          ) : null}
          <div className="mb-2">
            <p className="mb-1 text-zinc-600">{t("menu.layout")}</p>
            <div className="flex gap-1.5" role="group">
              {layoutModes.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  data-testid={`layout-${mode}`}
                  aria-pressed={layout === mode}
                  onClick={() =>
                    send({ type: "admin.layout.set", layout: mode })
                  }
                  className={`flex-1 rounded-lg border px-2 py-1 font-medium ${
                    layout === mode
                      ? "border-accent bg-accent/10 text-accent-strong"
                      : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  {t(`menu.layoutMode.${mode}`)}
                </button>
              ))}
            </div>
          </div>
          {/* Both need the admin token itself, not just the role: a
              co-facilitator promoted in the room holds no token, and the
              server would refuse them. */}
          {adminToken !== null ? (
            <>
              <button
                type="button"
                data-testid="follow-up-board"
                onClick={() =>
                  void copy(
                    "follow-up",
                    t("menu.followUpName", { name: boardName }),
                  )
                }
                disabled={copying !== null}
                className="mb-2 w-full rounded-lg border border-zinc-200 px-3 py-1 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {t("menu.followUp")}
              </button>
              <button
                type="button"
                data-testid="duplicate-board"
                onClick={() =>
                  void copy(
                    "duplicate",
                    t("menu.duplicateName", { name: boardName }),
                  )
                }
                disabled={copying !== null}
                className="mb-2 w-full rounded-lg border border-zinc-200 px-3 py-1 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {t("menu.duplicate")}
              </button>
              {copyFailed ? (
                <p role="alert" className="mb-2 text-xs text-red-700">
                  {t("menu.copyFailed")}
                </p>
              ) : null}
            </>
          ) : null}
          <TemplateLinkButton columns={columns} />
          <p className="mb-2 text-xs text-zinc-400">
            {retentionAt === null
              ? t("menu.retentionKept")
              : t("menu.retentionNotice", {
                  date: formatDate(retentionAt),
                })}
          </p>
          <div className="flex gap-2">
            {retentionAt !== null ? (
              <button
                type="button"
                onClick={() => send({ type: "admin.board.keep" })}
                className="rounded-lg border border-zinc-200 px-3 py-1 text-zinc-700 hover:bg-zinc-50"
              >
                {t("menu.keep")}
              </button>
            ) : null}
            {/* Deleting wipes the board for everyone and cannot be undone.
                    The confirmation is therefore a SECOND button beside the
                    trigger, never one swapped in underneath the pointer — with
                    an in-place swap a double-click on "Delete now" destroyed
                    the retro on its own second click. */}
            <button
              type="button"
              data-testid="delete-board"
              aria-expanded={confirmingDelete}
              onClick={() => setConfirmingDelete(!confirmingDelete)}
              className="rounded-lg border border-red-200 px-3 py-1 text-red-700 hover:bg-red-50"
            >
              {confirmingDelete ? t("note.cancel") : t("menu.deleteNow")}
            </button>
            {confirmingDelete ? (
              <button
                type="button"
                data-testid="delete-board-confirm"
                onClick={() => send({ type: "admin.board.delete" })}
                className="rounded-lg bg-red-700 px-3 py-1 font-medium text-white"
              >
                {t("menu.reallyDelete")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </HeaderPopover>
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
    <div className="mb-2">
      <button
        type="button"
        data-testid="template-link-copy"
        disabled={names.length === 0 || tooMany}
        onClick={() => void copy()}
        className="w-full rounded-lg border border-zinc-200 px-3 py-1 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {copied ? t("board.copied") : t("menu.templateLink")}
      </button>
      {/* A disabled button says why, as the voter-names switch does. */}
      <p className="mt-1 text-xs text-zinc-500">
        {names.length === 0
          ? t("menu.templateLinkNoVisible")
          : tooMany
            ? t("menu.templateLinkTooMany", { max: TEMPLATE_LINK_MAX_COLUMNS })
            : t("menu.templateLinkHint")}
      </p>
      {fallbackUrl !== null ? (
        <input
          readOnly
          autoFocus
          data-testid="template-link-input"
          aria-label={t("menu.templateLink")}
          value={fallbackUrl}
          onFocus={(event) => event.currentTarget.select()}
          className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600"
        />
      ) : null}
    </div>
  );
}

// Once voting has started, the setting is frozen: turning names on afterwards
// would attribute dots that were cast under the blind promise, and nobody can
// take a dot back. The server draws the line at the first dot; the menu draws
// it one step earlier, at the vote phase itself, so the control never offers a
// click the server would refuse.
function voterNamesLocked(phase: Phase): boolean {
  return (
    phase === "vote" ||
    phase === "discuss" ||
    phase === "close" ||
    phase === "done"
  );
}

function formatDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}
