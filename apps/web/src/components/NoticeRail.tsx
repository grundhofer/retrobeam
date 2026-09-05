// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useBoardStore } from "../store/boardStore.js";

const DISMISS_AFTER_MS = 6000;

// Every refusal used to be silent: the server rejected a command, the client
// quietly resynced, and the user's typed note vanished with no explanation.
// This is the one place a refusal becomes words. aria-live so it reaches a
// screen reader too — a silent failure is worse there, not better.
export function NoticeRail() {
  const { t } = useTranslation();
  const notices = useBoardStore((store) => store.notices);
  const dismiss = useBoardStore((store) => store.dismiss);

  useEffect(() => {
    if (notices.length === 0) return;
    const timers = notices.map((notice) =>
      setTimeout(() => dismiss(notice.id), DISMISS_AFTER_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, [notices, dismiss]);

  return (
    <div
      aria-live="polite"
      data-testid="notices"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
    >
      {notices.map((notice) => (
        <div
          key={notice.id}
          data-testid="notice"
          className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-lg px-3 py-2 text-sm shadow-lg ${
            notice.tone === "error"
              ? "bg-red-800 text-white"
              : "bg-amber-100 text-amber-900"
          }`}
        >
          <span>{t(notice.key)}</span>
          <button
            type="button"
            onClick={() => dismiss(notice.id)}
            aria-label={t("reject.dismiss")}
            className="ml-auto rounded px-1 opacity-70 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-white"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
