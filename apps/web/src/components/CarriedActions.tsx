// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import { Icon } from "./Icon.js";
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
  // sebaro's list: open items as rows, done ones in the done form with the
  // success glyph and „erledigt:“ for screen readers (spec/02 §3.3).
  return (
    <section
      data-testid="carried-actions"
      aria-labelledby="carried-actions-title"
      className="sb-stack"
    >
      <h2 id="carried-actions-title" className="sb-list-header">
        {t("lobby.carried.title")}{" "}
        <span className="sb-list-header__count">{carried.length}</span>
      </h2>
      <p className="sb-field__help">
        {t("lobby.carried.hint", { name: from })}
      </p>
      <ul className="sb-list">
        {carried.map((action) =>
          action.status === "done" ? (
            <li
              key={action.id}
              data-testid="carried-action"
              className="sb-list-row sb-list-row--done"
            >
              <span className="sb-list-row__lead">
                <Icon name="success--filled-16" size={16} />
              </span>
              <div className="sb-list-row__main">
                <p className="sb-list-row__title">
                  <span className="sb-visually-hidden">
                    {t("lobby.carried.done")}:{" "}
                  </span>
                  {action.text}
                </p>
              </div>
            </li>
          ) : (
            <li
              key={action.id}
              data-testid="carried-action"
              className="sb-list-row"
            >
              <div className="sb-list-row__main">
                <p className="sb-list-row__title">{action.text}</p>
              </div>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
