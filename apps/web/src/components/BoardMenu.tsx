// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  CURSORS_ACTIVATABLE,
  EXPORT_DOWNLOADS,
  EXPORT_SCOPES,
  exportFileName,
  layoutModes,
  type ExportScope,
  type LayoutMode,
  type Phase,
} from "@retrobeam/shared";
import { useConnection } from "../lib/connection.js";
import { duplicateBoard, fetchBoardExport } from "../lib/api.js";
import { renderBoardImage } from "../lib/exportImage.js";
import { loadAdminToken, saveAdminToken } from "../lib/session.js";

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
}) {
  const { t } = useTranslation();
  const { send } = useConnection();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [includeAuthors, setIncludeAuthors] = useState(false);
  const [scope, setScope] = useState<ExportScope>("all");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [imaging, setImaging] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  async function duplicate() {
    if (duplicating) return;
    const token = loadAdminToken(boardId);
    if (token === null) return;
    setDuplicating(true);
    try {
      const created = await duplicateBoard(
        boardId,
        t("menu.duplicateName", { name: boardName }),
        token,
      );
      saveAdminToken(created.boardId, created.adminToken);
      void navigate(`/board/${created.boardId}`);
    } catch {
      setDuplicating(false); // stay put; the menu remains usable to retry
    }
  }

  // Render the board to a JPEG in this tab and hand it to the browser as a
  // download. The bytes never leave the machine, and the SNAPSHOT is re-fetched
  // from the export route rather than read from the board store — see
  // fetchBoardExport for why that distinction is the whole point.
  async function downloadImage() {
    if (imaging) return;
    setImaging(true);
    setImageFailed(false);
    let url: string | null = null;
    try {
      const data = await fetchBoardExport(boardId, scope, includeAuthors);
      const blob = await renderBoardImage(data, scope);
      url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFileName(data.boardName, scope, "jpg");
      link.click();
    } catch {
      // A silent no-op click is the worst outcome here: the person clicked
      // "JPEG" and nothing happened, with no way to tell whether it worked.
      setImageFailed(true);
    } finally {
      // Revoke on the next tick — Safari has not started the download yet when
      // click() returns, and revoking synchronously cancels it.
      if (url !== null) {
        const revoke = url;
        setTimeout(() => URL.revokeObjectURL(revoke), 10_000);
      }
      setImaging(false);
    }
  }

  function exportHref(format: string): string {
    const params = new URLSearchParams({ format });
    // Only when non-default, so the "everything" URL stays byte-identical to
    // the one that shipped before scopes existed (same as `authors`).
    if (scope !== "all") params.set("scope", scope);
    if (includeAuthors) params.set("authors", "true");
    return `/api/boards/${boardId}/export?${params.toString()}`;
  }

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
          setConfirmingDelete(false);
        }
      }}
    >
      <button
        type="button"
        data-testid="board-menu"
        onClick={() => setOpen(!open)}
        className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-accent"
      >
        ⋯
      </button>
      {open ? (
        <div className="absolute top-9 right-0 z-40 flex w-64 flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-sm shadow-lg">
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
              <p className="mt-1.5 text-xs text-red-700">
                {t("menu.imageFailed")}
              </p>
            ) : null}
          </div>

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
                    checked={cursorsEnabled}
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
              <button
                type="button"
                data-testid="duplicate-board"
                onClick={() => void duplicate()}
                disabled={duplicating}
                className="mb-2 w-full rounded-lg border border-zinc-200 px-3 py-1 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {t("menu.duplicate")}
              </button>
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
        </div>
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
