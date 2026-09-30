// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import type { Participant } from "@retrobeam/shared";
import { isLastFacilitator, RoleToggleButton } from "./RoleToggleButton.js";

export interface RosterProps {
  participants: Participant[];
  youId: string | null;
  /** facilitators get the role switch on every row; the header's avatar menu
   *  has it too, but behind 28px circles nobody finds in the lobby */
  isAdmin?: boolean;
}

export function Roster({ participants, youId, isAdmin = false }: RosterProps) {
  const { t } = useTranslation();
  return (
    <section aria-label={t("board.participants")}>
      <h2 className="mb-2 text-sm font-semibold tracking-wide text-zinc-500 uppercase">
        {t("board.participants")}
      </h2>
      <ul className="flex flex-col gap-1.5">
        {participants.map((participant) => (
          <li
            key={participant.id}
            data-testid="roster-item"
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${
              participant.online ? "" : "opacity-45"
            }`}
          >
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: participant.color }}
            />
            <span className="truncate text-zinc-800">
              {participant.name}
              {participant.id === youId ? (
                <span className="text-zinc-500"> ({t("board.you")})</span>
              ) : null}
            </span>
            {participant.role === "facilitator" ? (
              <span className="ml-auto rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent-strong">
                {t("board.facilitator")}
              </span>
            ) : null}
            {!participant.online ? (
              <span className="ml-auto text-xs text-zinc-500">
                {t("board.offline")}
              </span>
            ) : null}
            {/* Not on the last facilitator's own row: there it could only be
                refused. The avatar menu, where someone looks for it, says why. */}
            {isAdmin && !isLastFacilitator(participant, participants) ? (
              <span
                className={
                  participant.role === "facilitator" || !participant.online
                    ? ""
                    : "ml-auto"
                }
              >
                <RoleToggleButton
                  participant={participant}
                  participants={participants}
                  testId={`roster-role-${participant.name}`}
                  className="rounded-lg px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-accent"
                />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
