// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import type { Participant } from "@retrobeam/shared";
import { useConnection } from "../lib/connection.js";

/** The server refuses to demote the board's last facilitator (a board nobody
 *  can steer is stuck), counting every participant row, online or not — the
 *  same roster the client holds. */
export function isLastFacilitator(
  participant: Participant,
  participants: Participant[],
): boolean {
  return (
    participant.role === "facilitator" &&
    participants.filter((p) => p.role === "facilitator").length <= 1
  );
}

// Make someone a (co-)facilitator, or take the role back — the one control
// behind both the avatar menu in the header and the lobby's roster row, so the
// two can never send different things. Demoting the last facilitator is not
// offered as a click that fails with a generic error: the button is disabled
// and the reason is visible text, because a disabled control's title is not
// reliably announced.
export function RoleToggleButton({
  participant,
  participants,
  onDone,
  className,
  testId,
}: {
  participant: Participant;
  participants: Participant[];
  onDone?: () => void;
  className: string;
  testId: string;
}) {
  const { t } = useTranslation();
  const { send } = useConnection();
  const last = isLastFacilitator(participant, participants);
  return (
    <>
      <button
        type="button"
        data-testid={testId}
        disabled={last}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          send({
            type: "admin.role.set",
            participantId: participant.id,
            role: participant.role === "facilitator" ? "member" : "facilitator",
          });
          onDone?.();
        }}
        className={className}
      >
        {participant.role === "facilitator"
          ? t("roster.removeFacilitator")
          : t("roster.makeFacilitator")}
      </button>
      {last ? (
        <span
          data-testid={`${testId}-reason`}
          className="block px-2 pb-0.5 text-xs text-zinc-500"
        >
          {t("roster.lastFacilitator")}
        </span>
      ) : null}
    </>
  );
}
