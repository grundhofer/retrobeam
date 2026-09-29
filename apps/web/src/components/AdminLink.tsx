// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminLinkUrl } from "../lib/adminLink.js";

// The facilitator's private link, offered only where the token already is (the
// callers check). It sits beside the team link in the lobby — the screen most
// likely to be on a projector while the room gathers — so the token is masked
// until its owner asks to see it; Copy works without revealing it.
export function AdminLink({
  boardId,
  adminToken,
  compact = false,
}: {
  boardId: string;
  adminToken: string;
  // The board menu is too narrow for field and buttons on one line.
  compact?: boolean;
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

  return (
    <div
      data-testid="admin-link"
      className="rounded-lg border border-amber-200 bg-amber-50 p-3"
    >
      <div className="mb-1 flex items-center gap-2">
        <label
          htmlFor={inputId}
          className="text-sm font-semibold tracking-wide text-amber-900 uppercase"
        >
          {t("adminLink.label")}
        </label>
        <span className="rounded-full border border-amber-300 px-2 py-0.5 text-xs font-medium text-amber-900">
          {t("adminLink.private")}
        </span>
      </div>
      <p className="mb-2 text-xs text-amber-900">{t("adminLink.hint")}</p>
      {/* The field takes a line of its own wherever the buttons would squeeze
          it: always in the menu, and below `sm` in the lobby, where the two
          buttons left a phone's field with little more than
          "https://" — not enough to see which link it is. */}
      <div
        className={`flex flex-wrap gap-2 ${compact ? "" : "sm:flex-nowrap"}`}
      >
        <input
          ref={inputRef}
          id={inputId}
          data-testid="admin-link-input"
          readOnly
          value={revealed ? url : masked}
          onFocus={(event) => {
            if (revealed) event.currentTarget.select();
          }}
          className={`w-full min-w-0 basis-full rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm text-zinc-600 ${compact ? "" : "sm:basis-auto"}`}
        />
        <button
          type="button"
          data-testid="admin-link-reveal"
          aria-pressed={revealed}
          onClick={() => setRevealed(!revealed)}
          className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-accent ${
            revealed
              ? "border-amber-300 bg-amber-100"
              : "border-amber-200 bg-white"
          }`}
        >
          {/* A fixed label, as FocusToggle's: the button carries aria-pressed,
              so swapping it to "Hide" once pressed would be announced as
              "Hide, pressed" — hiding switched on, while the link is shown.
              State lives in aria-pressed, the fill and the field itself. */}
          {t("adminLink.show")}
        </button>
        <button
          type="button"
          data-testid="admin-link-copy"
          onClick={() => void copy()}
          className="shrink-0 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-accent"
        >
          {copied ? t("board.copied") : t("board.copy")}
        </button>
      </div>
    </div>
  );
}
