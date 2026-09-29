// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { teamLinkUrl } from "../lib/adminLink.js";
import { QrCode, QrFullscreen } from "./QrCode.js";

// The TEAM link, as text and as a QR code. Built from the board id alone, never
// from the address bar: the facilitator link carries its token in the
// fragment, and this is the card that sits on a projector while the room
// gathers — so nothing here may ever read `location.hash`.
export function ShareLink({ boardId }: { boardId: string }) {
  const { t } = useTranslation();
  // The lobby card and the header's invite panel can both be on screen.
  const inputId = useId();
  const [copied, setCopied] = useState(false);
  const [large, setLarge] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const qrButtonRef = useRef<HTMLButtonElement>(null);
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
    <div data-testid="share-link">
      <label
        htmlFor={inputId}
        className="mb-2 block text-sm font-semibold tracking-wide text-zinc-500 uppercase"
      >
        {t("board.share")}
      </label>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          id={inputId}
          data-testid="share-link-input"
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="w-full min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-600"
        />
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-accent"
        >
          {copied ? t("board.copied") : t("board.copy")}
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3">
        {/* The code itself is the button: in a meeting room the obvious
            gesture is "make that bigger", not hunting for a link beside it. */}
        <button
          ref={qrButtonRef}
          type="button"
          data-testid="qr-enlarge"
          aria-label={t("invite.enlarge")}
          onClick={() => setLarge(true)}
          className="shrink-0 rounded-lg border border-zinc-200 bg-white p-1 hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {/* 3px a module — 123px for a board link. See QrCode on why not
              a size class. */}
          <QrCode value={url} label={t("invite.qrLabel")} modulePx={3} />
        </button>
        <div className="flex min-w-0 flex-col items-start gap-1 text-sm">
          <p className="text-zinc-500">{t("invite.qrHint")}</p>
          <button
            type="button"
            onClick={() => setLarge(true)}
            // Mouse users already have the code to click; one tab stop for the
            // same action is enough.
            tabIndex={-1}
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            {t("invite.enlarge")}
          </button>
        </div>
      </div>
      {large ? (
        <QrFullscreen
          url={url}
          onClose={() => {
            setLarge(false);
            qrButtonRef.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}
