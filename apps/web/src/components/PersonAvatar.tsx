// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { nameInitials, type Participant } from "@retrobeam/shared";
import { Icon } from "./Icon.js";

// A person in a list (sebaro spec/02 §3.13, D132, F6): initials in a ring, no
// colour of one's own; offline a dashed ring, the facilitator the shield.
// Decorative beside the name, which the row says in words.
export function PersonAvatar({ participant }: { participant: Participant }) {
  return (
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
  );
}
