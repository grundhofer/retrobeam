// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminLinkUrl } from "../lib/adminLink.js";
import { Icon } from "./Icon.js";

// The facilitator's private link, offered only where the token already is (the
// callers check). It sits beside the team link in the lobby — the screen most
// likely to be on a projector while the room gathers — so the token is masked
// until its owner asks to see it; Copy works without revealing it.
export function AdminLink({
  boardId,
  adminToken,
}: {
  boardId: string;
  adminToken: string;
}) {
  const { t } = useTranslation();
  // The lobby and the open board menu can both show it at once.
  const inputId = useId();
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const url = adminLinkUrl(location.origin, boardId, adminToken);
  const masked = `${location.origin}/board/${boardId}#admin=••••••••`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (non-secure origin) — show the real link and
      // select it so it can be copied by hand, as ShareLink does.
      setRevealed(true);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }

  // sebaro's callout (the amber card before): the label with its „Privat“
  // tag, the sentence, then the masked field and its two keys (§6.1 a).
  return (
    <div data-testid="admin-link" className="sb-callout sb-callout--warning">
      <Icon name="lock" size={20} />
      <div className="sb-callout__text sb-stack">
        <p className="flex flex-wrap items-center gap-2">
          <label
            htmlFor={inputId}
            className="[font-weight:var(--sb-type-body-strong-weight)]"
          >
            {t("adminLink.label")}
          </label>
          <span className="sb-tag">{t("adminLink.private")}</span>
        </p>
        <p>{t("adminLink.hint")}</p>
        <div className="sb-field__control">
          <input
            ref={inputRef}
            id={inputId}
            data-testid="admin-link-input"
            readOnly
            value={revealed ? url : masked}
            onFocus={(event) => {
              if (revealed) event.currentTarget.select();
            }}
          />
        </div>
        <div className="sb-cluster">
          <button
            type="button"
            data-testid="admin-link-reveal"
            aria-pressed={revealed}
            onClick={() => setRevealed(!revealed)}
            className="sb-secondary-action"
          >
            {/* A fixed label, as FocusToggle's: the button carries
                aria-pressed, so swapping it to "Hide" once pressed would be
                announced as "Hide, pressed" — hiding switched on, while the
                link is shown. State lives in aria-pressed, the icon and the
                field itself. */}
            <Icon name={revealed ? "eye-off" : "eye"} size={20} />
            {t("adminLink.show")}
          </button>
          <button
            type="button"
            data-testid="admin-link-copy"
            onClick={() => void copy()}
            className="sb-secondary-action"
          >
            <Icon name="copy" size={20} />
            {copied ? t("board.copied") : t("board.copy")}
          </button>
        </div>
        <p role="status" className="sb-visually-hidden">
          {copied ? t("board.copied") : ""}
        </p>
      </div>
    </div>
  );
}
