// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import type { Note } from "@retrobeam/shared";
import { useConnection } from "../lib/connection.js";
import { Icon } from "./Icon.js";

export interface DiscussBarProps {
  topTargetIds: string[];
  tallies: Record<string, number> | null;
  focusId: string | null;
  notes: Note[];
  isAdmin: boolean;
}

// The discussion queue: crowned cards in rank order; the facilitator walks
// them and everyone's board focuses along.
export function DiscussBar({
  topTargetIds,
  tallies,
  focusId,
  notes,
  isAdmin,
}: DiscussBarProps) {
  const { t } = useTranslation();
  const { send } = useConnection();

  if (topTargetIds.length === 0) return null;

  function excerptFor(targetId: string): string {
    const stackMembers = notes.filter((n) => n.groupId === targetId);
    // Which member speaks for the stack must not depend on array order. On an
    // anonymous board the store holds your own cards first (they arrived while
    // writing; the reveal appends everyone else's), so "the first member"
    // would put your card on the chip — on your screen only, which a shared
    // screen then shows the room. The anchor (its id IS the stack's id) is the
    // same card on every screen; a stack whose anchor was deleted falls back
    // to the lowest id, which is random and just as shared.
    const source =
      stackMembers.find((n) => n.id === targetId) ??
      stackMembers.reduce<Note | undefined>(
        (lowest, n) =>
          lowest === undefined || n.id.localeCompare(lowest.id) < 0
            ? n
            : lowest,
        undefined,
      ) ??
      notes.find((n) => n.id === targetId);
    const text = source?.text ?? "";
    const short = text.length > 24 ? `${text.slice(0, 23)}…` : text;
    return stackMembers.length > 0 ? `${short} ×${stackMembers.length}` : short;
  }

  // sebaro's chips (spec/02 §3.x): one per crowned card, in rank order, the
  // one in discussion aria-pressed; its rank, the card's words and its votes,
  // no crown and no dot. Members read them; only the facilitator moves on.
  return (
    <div role="group" aria-label={t("discuss.queue")} className="sb-chips">
      {topTargetIds.map((targetId, index) => {
        const focused = focusId === targetId;
        const count = tallies?.[targetId] ?? 0;
        return (
          <button
            key={targetId}
            type="button"
            data-testid={`discuss-chip-${index + 1}`}
            aria-pressed={focused}
            disabled={!isAdmin}
            onClick={() =>
              send({
                type: "admin.discuss.focus",
                targetId: focused ? null : targetId,
              })
            }
            className="sb-chip"
          >
            <Icon name="check" size={16} />
            {`${index + 1}. ${excerptFor(targetId)} · `}
            <span className="tabular-nums">
              {t("discuss.votes", { count })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
