// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useConnection } from "../lib/connection.js";
import { Icon } from "./Icon.js";

export interface ReadyToggleProps {
  youReady: boolean;
  /** The action zone's slot, given for a member only: saying „Ich bin
   *  fertig“ is a member's next step, so it is their one primary action at
   *  the bottom (sebaro spec/03 §2, D39; owner, 2026-11-07). The facilitator
   *  has „Weiter: …“ there, so theirs stays a secondary key in place. */
  primarySlot?: HTMLElement | null;
  /** the secondary key's classes where it stands in place */
  className?: string;
}

// One key with a fixed label, its state in aria-pressed and the check (a label
// that swapped while pressed would be read as the opposite).
export function ReadyToggle({
  youReady,
  primarySlot = null,
  className = "sb-secondary-action",
}: ReadyToggleProps) {
  const { t } = useTranslation();
  const { send } = useConnection();
  const primary = primarySlot !== null;
  const key = (
    <button
      type="button"
      data-testid="ready-toggle"
      aria-pressed={youReady}
      onClick={() => send({ type: "ready.set", ready: !youReady })}
      className={primary ? "sb-primary-action" : className}
    >
      {/* On the lime fill the check keeps the key's own ink; the success
          green is for the check on the page's ground. */}
      {youReady ? (
        primary ? (
          <Icon name="check" size={20} />
        ) : (
          <Icon name="check" size={20} className="text-success" />
        )
      ) : null}
      {t("ready.imDone")}
    </button>
  );
  return primary ? createPortal(key, primarySlot) : key;
}
