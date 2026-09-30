// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import type { Action } from "@retrobeam/shared";

// The lobby of a follow-up retro opens on what the room promised last time,
// so the retro can start by asking where those stand. Read-only here: ticking
// them off happens in the Action Items panel while discussing, where every
// item lives. Renders nothing on a board that carried nothing.
export function CarriedActions({ actions }: { actions: Action[] }) {
  const { t } = useTranslation();
  const carried = actions.filter((a) => a.carriedFrom !== null);
  if (carried.length === 0) return null;
  const from = carried[0]?.carriedFrom ?? "";
  return (
    <section
      data-testid="carried-actions"
      aria-labelledby="carried-actions-title"
      className="rounded-xl border border-zinc-200 bg-white p-5"
    >
      <h2
        id="carried-actions-title"
        className="text-sm font-semibold tracking-wide text-zinc-600 uppercase"
      >
        ✅ {t("lobby.carried.title")}
      </h2>
      <p className="mt-1 mb-3 text-sm text-zinc-500">
        {t("lobby.carried.hint", { name: from })}
      </p>
      <ul className="flex flex-col gap-1.5">
        {carried.map((action) => (
          <li
            key={action.id}
            data-testid="carried-action"
            className={`text-sm break-words ${
              action.status === "done"
                ? "text-zinc-500 line-through"
                : "text-zinc-800"
            }`}
          >
            {action.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
