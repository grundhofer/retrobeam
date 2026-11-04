// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { nameInitials, type Participant } from "@retrobeam/shared";
import { Icon } from "./Icon.js";
import { RoleToggleButton } from "./RoleToggleButton.js";

export interface AvatarRowProps {
  participants: Participant[];
  youId: string | null;
  isAdmin: boolean;
}

// Compact presence for the board header, as sebaro's avatars (spec/02 §3.13):
// initials in a ring without a fill — no colour per person, the name tells
// people apart (plan §2.4 F6). Presence and role as sebaro D132 has them:
// offline is a dashed ring with muted initials (data-sb-presence), never
// dimmed; a facilitator carries the small shield on the ring
// (svg.sb-avatar__role). The name says both: „Anna, Moderation, offline“.
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
            data-sb-presence={participant.online ? undefined : "offline"}
            className={`sb-avatar sb-avatar--32 ${isAdmin ? "cursor-pointer" : ""}`}
          >
            <span aria-hidden="true">{nameInitials(participant.name)}</span>
            {participant.role === "facilitator" ? (
              <Icon name="shield" size={16} className="sb-avatar__role" />
            ) : null}
            {/* Two people can share initials, a disabled button is not
                reachable by keyboard, and its title is not reliably announced —
                so the name and the presence state live here as real content.
                In the discussion phase this row IS the roster: the participant
                rail steps aside there for the action list. Since sebaro D132
                the role is in it too, as the shield is only a picture:
                „Anna, Moderation, offline“. */}
            <span className="sr-only">
              {participant.name}
              {participant.role === "facilitator"
                ? `, ${t("board.facilitator")}`
                : ""}
              {participant.online ? "" : `, ${t("board.offline")}`}
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
