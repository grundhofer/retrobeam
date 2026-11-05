// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { teamLinkUrl } from "../lib/adminLink.js";
import { Icon } from "./Icon.js";
import { InviteDialog } from "./InviteDialog.js";

// The TEAM link in the lobby: sebaro's read-only field with „Kopieren“, and
// „QR-Code groß anzeigen“ for the room, which opens the invite dialog with the
// code (spec/02 §4.6). Built from the board id alone, never from the address
// bar: the facilitator link carries its token in the fragment, and this is the
// card that sits on a projector while the room gathers — so nothing here may
// ever read `location.hash`.
export function ShareLink({ boardId }: { boardId: string }) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputId = useId();
  const [copied, setCopied] = useState(false);
  const [large, setLarge] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const url = teamLinkUrl(location.origin, boardId);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (non-secure origin) — select the text so
      // the user can copy manually.
      inputRef.current?.select();
    }
  }

  return (
    <div data-testid="share-link" className="sb-stack">
      <div className="sb-field">
        <label htmlFor={inputId} className="sb-field__label">
          {t("board.share")}
        </label>
        <div className="sb-field__control">
          <input
            ref={inputRef}
            id={inputId}
            data-testid="share-link-input"
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      </div>
      <div className="sb-cluster">
        <button
          type="button"
          data-testid="share-link-copy"
          onClick={() => void copy()}
          className="sb-secondary-action"
        >
          <Icon name="copy" size={20} />
          {copied ? t("board.copied") : t("board.copy")}
        </button>
        <button
          type="button"
          ref={triggerRef}
          data-testid="qr-enlarge"
          aria-haspopup="dialog"
          onClick={() => setLarge(true)}
          className="sb-secondary-action"
        >
          <Icon name="qr-code" size={20} />
          {t("invite.enlarge")}
        </button>
      </div>
      <p className="sb-field__help">{t("invite.qrHint")}</p>
      <p role="status" className="sb-visually-hidden">
        {copied ? t("board.copied") : ""}
      </p>
      <InviteDialog
        boardId={boardId}
        open={large}
        onClose={() => setLarge(false)}
        returnTo={triggerRef}
      />
    </div>
  );
}
