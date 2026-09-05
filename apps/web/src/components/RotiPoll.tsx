// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import { useConnection } from "../lib/connection.js";
import { useBoardStore } from "../store/boardStore.js";

const SCORES = [1, 2, 3, 4, 5] as const;

// Return On Time Invested — an anonymous 1-5 closing pulse. Individual scores
// never leave the server, and the average is published once when the poll
// closes (a running mean would be differenceable, see ROTI_MIN_ANONYMOUS).
// `readOnly` renders the published result on the archived board.
export function RotiPoll({ readOnly = false }: { readOnly?: boolean }) {
  const { t } = useTranslation();
  const { send } = useConnection();
  const roti = useBoardStore((store) => store.state.roti);

  return (
    <section
      data-testid="roti-poll"
      className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-5 text-center"
    >
      <p className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">
        {t("roti.title")}
      </p>
      <p className="text-sm text-zinc-500">{t("roti.question")}</p>
      <div className="flex gap-2">
        {(readOnly ? [] : SCORES).map((score) => (
          <button
            key={score}
            type="button"
            data-testid={`roti-${score}`}
            aria-pressed={roti.yourScore === score}
            onClick={() => send({ type: "roti.set", score })}
            className={`size-10 rounded-full text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              roti.yourScore === score
                ? "bg-accent text-white"
                : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {score}
          </button>
        ))}
      </div>
      {roti.average !== null ? (
        <p
          data-testid="roti-result"
          className="text-sm text-zinc-500 tabular-nums"
        >
          {t("roti.result", { average: roti.average, count: roti.count })}
        </p>
      ) : roti.released ? (
        // Closed with too few answers to summarise anonymously — say so, rather
        // than leave a promise of an average that will never arrive.
        <p data-testid="roti-too-few" className="text-xs text-zinc-400">
          {t("roti.tooFew")}
        </p>
      ) : roti.count > 0 ? (
        <p
          data-testid="roti-pending"
          className="text-xs text-zinc-400 tabular-nums"
        >
          {t("roti.pending", { count: roti.count })}
        </p>
      ) : (
        <p className="text-xs text-zinc-400">{t("roti.anonymous")}</p>
      )}
    </section>
  );
}
