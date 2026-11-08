// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Participant } from "@retrobeam/shared";
import { Icon } from "./Icon.js";
import { ReadyToggle } from "./ReadyToggle.js";

export interface RoundStatusProps {
  roster: Participant[];
  readyIds: string[];
  you: Participant;
  isAdmin: boolean;
  /** the action zone's slot: a member's „Ich bin fertig“ is the view's one
   *  primary action there (ReadyToggle); null for the facilitator */
  actionSlot?: HTMLElement | null;
}

// The round's status above the board, in the phases that wait for everyone
// (owner, 2026-11-08, sketch B2a): how far the room is, as words and a bar,
// and the people still open BY NAME — the one thing anyone can act on, and
// the thing initials could not say (two people with the same letter, or the
// one who forgot to press). The finished ones are counted; the whole list is
// one key away. It replaces the side rail there, which read as a fourth
// column of the board.
export function RoundStatus({
  roster,
  readyIds,
  you,
  isAdmin,
  actionSlot = null,
}: RoundStatusProps) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const titleId = useId();
  const listId = useId();
  const online = roster.filter((p) => p.online);
  const done = online.filter((p) => readyIds.includes(p.id));
  const open = online.filter((p) => !readyIds.includes(p.id));
  const youReady = readyIds.includes(you.id);
  const nameOf = (p: Participant) =>
    p.id === you.id ? `${p.name} ${t("roster.you")}` : p.name;

  return (
    <section
      aria-labelledby={titleId}
      data-testid="round-status"
      className="mb-4 flex flex-col gap-3 border-b border-border pb-4"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* A label, not an h2: sebaro's unlayered h2 rule would make it a
            headline, and the round is status beside the board, not a part
            of its content. */}
        <p
          id={titleId}
          className="text-caption [font-weight:var(--sb-type-title-weight)] text-text-muted"
        >
          {t("round.title")}
        </p>
        {/* The progress in sebaro's state voice: the words carry it, the bar
            repeats it for the eye. */}
        <div className="sb-progress w-40">
          <p
            role="status"
            data-testid="ready-count"
            className="sb-status tabular-nums"
          >
            <span>
              {t("ready.count", { ready: done.length, total: online.length })}
            </span>
          </p>
          <progress
            max={Math.max(online.length, 1)}
            value={done.length}
            aria-hidden="true"
          />
        </div>
        {open.length === 0 ? (
          <p
            data-testid="round-all-done"
            className="sb-status sb-status--success"
          >
            <Icon name="success" size={16} />
            <span>{t("round.allDone")}</span>
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption text-text-muted">
              {t("round.open")}
            </span>
            <ul className="sb-tags" data-testid="round-open">
              {open.map((p) => (
                <li key={p.id} className="sb-tag">
                  <Icon name="pending" size={16} />
                  {nameOf(p)}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          type="button"
          data-testid="round-all"
          aria-expanded={showAll}
          aria-controls={listId}
          onClick={() => setShowAll((value) => !value)}
          className="sb-text-action sb-text-action--compact"
        >
          {t("round.all", { count: online.length })}
        </button>
        {isAdmin ? (
          <span className="ms-auto">
            <ReadyToggle
              youReady={youReady}
              className="sb-secondary-action sb-secondary-action--compact"
            />
          </span>
        ) : (
          <ReadyToggle youReady={youReady} primarySlot={actionSlot} />
        )}
      </div>
      <ul id={listId} hidden={!showAll} className="sb-list">
        {online.map((p) => {
          const ready = readyIds.includes(p.id);
          return (
            <li key={p.id} data-testid="round-person" className="sb-list-row">
              <div className="sb-list-row__main">
                <p className="sb-list-row__title">{nameOf(p)}</p>
                <p className="sb-list-row__meta">
                  {ready ? (
                    <span className="text-success">{t("rail.ready")}</span>
                  ) : (
                    t("round.stillOpen")
                  )}
                </p>
              </div>
              {ready ? (
                <span className="sb-list-row__trail">
                  <Icon name="check" size={20} className="text-success" />
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
