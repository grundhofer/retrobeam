// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import type { Participant } from "@retrobeam/shared";
import { useConnection } from "../lib/connection.js";
import { Icon } from "./Icon.js";

export interface ReadyBarProps {
  readyIds: string[];
  roster: Participant[];
  youId: string | null;
}

export function ReadyBar({ readyIds, roster, youId }: ReadyBarProps) {
  const { t } = useTranslation();
  const { send } = useConnection();
  const online = roster.filter((p) => p.online);
  const youReady = youId !== null && readyIds.includes(youId);

  // sebaro: one secondary key with a fixed label, its state in aria-pressed
  // and the check (a label that swapped while pressed would be read as the
  // opposite), and the count as words, „3 von 5 fertig“.
  return (
    <div className="sb-cluster">
      <button
        type="button"
        data-testid="ready-toggle"
        aria-pressed={youReady}
        onClick={() => send({ type: "ready.set", ready: !youReady })}
        className="sb-secondary-action sb-secondary-action--compact"
      >
        {youReady ? <Icon name="check" size={20} /> : null}
        {t("ready.imDone")}
      </button>
      <span data-testid="ready-count" className="sb-field__help tabular-nums">
        {t("ready.count", { ready: readyIds.length, total: online.length })}
      </span>
    </div>
  );
}
