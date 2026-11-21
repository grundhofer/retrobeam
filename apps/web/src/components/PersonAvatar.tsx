// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { CSSProperties } from "react";
import {
  nameInitials,
  personColour,
  type Participant,
} from "@retrobeam/shared";
import { Icon } from "./Icon.js";

// A person's colour as a ring (owner, 2026-11-20, partly reversing plan F6,
// which had left people uncoloured): the same tone wherever they appear —
// the avatar's ring here and in the header, a small ring beside their name
// on a card, a voter chip, a pointer. 2 px, so the tone reads; sebaro's
// avatar ring is 1 px of border-strong (D132). The tones hold 3:1 on every
// ground (domain/colors.ts); the name and the initials still say who it is.
export function personRingStyle(participant: Participant): CSSProperties {
  return { borderColor: personColour(participant.color), borderWidth: 2 };
}

// A person in a list (sebaro spec/02 §3.13, D132): initials in a ring, the
// ring in their colour; offline a dashed ring, the facilitator the shield.
// Decorative beside the name, which the row says in words.
export function PersonAvatar({ participant }: { participant: Participant }) {
  return (
    <span
      aria-hidden="true"
      className="sb-avatar sb-avatar--32"
      data-sb-presence={participant.online ? undefined : "offline"}
      style={personRingStyle(participant)}
    >
      {nameInitials(participant.name)}
      {participant.role === "facilitator" ? (
        <Icon name="shield" size={16} className="sb-avatar__role" />
      ) : null}
    </span>
  );
}

// The ring alone, where a 32 px avatar does not fit: inside a chip, before a
// name on a pointer. Decorative; the name beside it says who it is.
export function PersonRing({ participant }: { participant: Participant }) {
  return (
    <span
      aria-hidden="true"
      data-testid="person-ring"
      className="inline-block size-3 shrink-0 rounded-full border-solid"
      style={personRingStyle(participant)}
    />
  );
}
