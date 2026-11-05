// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import { nameInitials, type Participant } from "@retrobeam/shared";
import { Icon } from "./Icon.js";
import { isLastFacilitator, RoleToggleButton } from "./RoleToggleButton.js";

export interface RosterProps {
  participants: Participant[];
  youId: string | null;
  /** facilitators get the role switch on every row; the header's avatar menu
   *  has it too, but behind 28px circles nobody finds in the lobby */
  isAdmin?: boolean;
}

// sebaro's list (spec/02 §3.3): one row per person, the avatar as the lead
// (initials in a ring, presence and role as in the header, D132, F6), the
// name, a meta line with the role and „offline“ in words, and the role switch
// at the end for a facilitator. No colour per person.
export function Roster({ participants, youId, isAdmin = false }: RosterProps) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="roster-title" className="sb-stack">
      <h2 id="roster-title" className="sb-list-header">
        {t("board.participants")}{" "}
        <span className="sb-list-header__count">{participants.length}</span>
      </h2>
      <ul className="sb-list">
        {participants.map((participant) => {
          const meta = [
            participant.role === "facilitator" ? t("board.facilitator") : null,
            participant.online ? null : t("board.offline"),
          ].filter((part) => part !== null);
          return (
            <li
              key={participant.id}
              data-testid="roster-item"
              className="sb-list-row"
            >
              <span className="sb-list-row__lead">
                <span
                  aria-hidden="true"
                  className="sb-avatar sb-avatar--32"
                  data-sb-presence={participant.online ? undefined : "offline"}
                >
                  {nameInitials(participant.name)}
                  {participant.role === "facilitator" ? (
                    <Icon name="shield" size={16} className="sb-avatar__role" />
                  ) : null}
                </span>
              </span>
              <div className="sb-list-row__main">
                <p className="sb-list-row__title">
                  {participant.name}
                  {participant.id === youId ? ` (${t("board.you")})` : null}
                </p>
                {meta.length > 0 ? (
                  <p className="sb-list-row__meta">{meta.join(" · ")}</p>
                ) : null}
              </div>
              {/* Not on the last facilitator's own row: there it could only be
                  refused. The avatar menu, where someone looks for it, says
                  why. */}
              {isAdmin && !isLastFacilitator(participant, participants) ? (
                <span className="sb-list-row__trail">
                  <RoleToggleButton
                    participant={participant}
                    participants={participants}
                    testId={`roster-role-${participant.name}`}
                    className="sb-secondary-action sb-secondary-action--compact"
                  />
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
