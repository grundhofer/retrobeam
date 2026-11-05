// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import { useConnection } from "../lib/connection.js";
import { SwitchField } from "./SwitchField.js";

// The facilitator's presentation switch, top-centre: with it on, cards that are
// not on stage are HIDDEN rather than dimmed, so a shared screen shows the room
// one thing at a time. Everyone else sees the state as a read-only pill —
// without it, "where did the other cards go?" has no answer on screen.
//
// A control command (no opId, never replayed): `send`, not `mutate`.
export function FocusToggle({
  focusMode,
  isAdmin,
}: {
  focusMode: boolean;
  isAdmin: boolean;
}) {
  const { t } = useTranslation();
  const { send } = useConnection();

  // Everyone else sees the state as a tag; the facilitator has sebaro's
  // switch (plan stage 5c), its state in aria-checked.
  if (!isAdmin) {
    return focusMode ? (
      <span data-testid="focus-mode-state" className="sb-tag">
        {t("focus.on")}
      </span>
    ) : null;
  }

  return (
    <SwitchField
      label={t("focus.label")}
      checked={focusMode}
      testId="focus-mode-toggle"
      onChange={(enabled) => send({ type: "admin.focus.set", enabled })}
    />
  );
}
