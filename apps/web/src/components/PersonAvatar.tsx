// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ReactNode } from "react";
import { nameInitials, type Participant } from "@retrobeam/shared";
import { Icon } from "./Icon.js";

// A person's tone as a ring (owner, 2026-11-20; sebaro FAR-16 since v3.1.2):
// the same tone wherever they appear — the avatar's 2 px ring here and in the
// header, a small ring before their name on a card, a voter chip, a pointer.
// sebaro draws both from `data-sb-person`; the name and the initials still
// say who it is.

// A person in a list (sebaro spec/02 §3.13, D132): initials in a ring, the
// ring in their tone; offline a dashed ring, the facilitator the shield.
// Decorative beside the name, which the row says in words.
export function PersonAvatar({ participant }: { participant: Participant }) {
  return (
    <span
      aria-hidden="true"
      className="sb-avatar sb-avatar--32"
      data-sb-person={participant.tone}
      data-sb-private=""
      data-sb-presence={participant.online ? undefined : "offline"}
    >
      {nameInitials(participant.name)}
      {participant.role === "facilitator" ? (
        <Icon name="shield" size={16} className="sb-avatar__role" />
      ) : null}
    </span>
  );
}

// A name with the small ring before it, where a 32 px avatar does not fit:
// a card's grey line, a voter chip (sebaro `.sb-person`). The ring is the
// wrapper's ::before, so it never leaves the line of the name.
export function PersonName({
  participant,
  className,
  children,
}: {
  participant: Participant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      data-testid="person-name"
      className={
        className === undefined ? "sb-person" : `sb-person ${className}`
      }
      data-sb-person={participant.tone}
      data-sb-private=""
    >
      {children}
    </span>
  );
}
