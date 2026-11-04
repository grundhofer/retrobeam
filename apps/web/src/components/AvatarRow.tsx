// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { nameInitials, type Participant } from "@retrobeam/shared";
import { RoleToggleButton } from "./RoleToggleButton.js";

export interface AvatarRowProps {
  participants: Participant[];
  youId: string | null;
  isAdmin: boolean;
}

// Compact presence for the board header, as sebaro's avatars (spec/02 §3.13):
// initials in a ring without a fill — no colour per person, the name tells
// people apart (plan §2.4 F6). sebaro has no presence or role state for an
// avatar yet (reported to sebaroDesign): a facilitator gets the ring in text
// colour and two pixels wide, someone offline a dashed ring and muted
// initials — shape, not colour. Offline is in the accessible name, the role
// in the title and the roster.
// Facilitators can click an avatar to hand off / share the facilitator role.
export function AvatarRow({ participants, youId, isAdmin }: AvatarRowProps) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);
  // Which side of the avatar the role menu hangs from — see HeaderPopover.
  // On a phone the row starts at the left edge, and a right-aligned menu
  // under the first avatars began off-screen.
  const [alignLeft, setAlignLeft] = useState(false);

  return (
    // Wraps: a full team of avatars in one row is wider than a phone.
    <ul className="sb-avatars flex-wrap">
      {participants.map((participant) => (
        <li
          key={participant.id}
          className="relative"
          onBlur={(event) => {
            // close only when focus leaves the avatar AND its menu
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            ) {
              setOpenId((id) => (id === participant.id ? null : id));
            }
          }}
        >
          <button
            type="button"
            data-testid={`avatar-${participant.name}`}
            title={
              participant.name +
              (participant.role === "facilitator"
                ? ` · ${t("board.facilitator")}`
                : "")
            }
            disabled={!isAdmin}
            onClick={(event) => {
              // Room for the widest label ("Zur Moderation machen") on the
              // right? Then hang it rightwards from the avatar's left edge.
              const rect = event.currentTarget.getBoundingClientRect();
              setAlignLeft(rect.right < 200);
              setOpenId(openId === participant.id ? null : participant.id);
            }}
            className={`sb-avatar sb-avatar--32 ${
              participant.role === "facilitator"
                ? "border-2 border-(--sb-color-text)"
                : ""
            } ${participant.online ? "" : "border-dashed text-(--sb-color-text-muted)"} ${isAdmin ? "cursor-pointer" : ""}`}
          >
            <span aria-hidden="true">{nameInitials(participant.name)}</span>
            {/* Two people can share initials, a disabled button is not
                reachable by keyboard, and its title is not reliably announced —
                so the name and the presence state live here as real content.
                In the discussion phase this row IS the roster: the participant
                rail steps aside there for the action list. The ROLE stays out
                of it — the ring and the title carry it, and the facilitator
                badge is counted elsewhere. */}
            <span className="sr-only">
              {participant.name}
              {participant.online ? "" : ` · ${t("board.offline")}`}
            </span>
          </button>
          {openId === participant.id && isAdmin ? (
            <span
              className={`absolute top-9 z-40 w-max rounded-lg border border-zinc-200 bg-white p-1 shadow-lg ${
                alignLeft ? "left-0" : "right-0"
              }`}
            >
              <RoleToggleButton
                participant={participant}
                participants={participants}
                onDone={() => setOpenId(null)}
                testId={`role-toggle-${participant.name}`}
                // contrast-ok: disabled state, exempt from WCAG 1.4.3
                className="block w-full rounded px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:text-zinc-400 disabled:hover:bg-transparent"
              />
              {participant.id === youId ? (
                <span className="block px-2 pb-0.5 text-xs text-zinc-500">
                  {t("roster.you")}
                </span>
              ) : null}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
