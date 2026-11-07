// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import type { Participant } from "@retrobeam/shared";
import { ReadyToggle } from "./ReadyToggle.js";

export interface ReadyBarProps {
  readyIds: string[];
  roster: Participant[];
  youId: string | null;
  /** the action zone's slot, for a member only (ReadyToggle) */
  actionSlot?: HTMLElement | null;
}

export function ReadyBar({
  readyIds,
  roster,
  youId,
  actionSlot = null,
}: ReadyBarProps) {
  const { t } = useTranslation();
  const online = roster.filter((p) => p.online);
  const youReady = youId !== null && readyIds.includes(youId);

  // sebaro: the ready key (ReadyToggle: a member's one primary action at the
  // bottom, the facilitator's secondary key here) and the count as words,
  // „3 von 5 fertig“.
  return (
    <div className="sb-cluster">
      <ReadyToggle
        youReady={youReady}
        primarySlot={actionSlot}
        className="sb-secondary-action sb-secondary-action--compact"
      />
      <span data-testid="ready-count" className="sb-field__help tabular-nums">
        {t("ready.count", { ready: readyIds.length, total: online.length })}
      </span>
    </div>
  );
}
