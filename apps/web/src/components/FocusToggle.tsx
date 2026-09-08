// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from "react-i18next";
import { useConnection } from "../lib/connection.js";

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

  if (!isAdmin) {
    return focusMode ? (
      <span
        data-testid="focus-mode-state"
        className="rounded-lg bg-accent/10 px-3 py-1 text-sm font-medium text-accent-strong"
      >
        🎯 {t("focus.on")}
      </span>
    ) : null;
  }

  return (
    <button
      type="button"
      data-testid="focus-mode-toggle"
      aria-pressed={focusMode}
      onClick={() => send({ type: "admin.focus.set", enabled: !focusMode })}
      className={`rounded-lg px-3 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        focusMode
          ? "bg-accent/10 text-accent-strong"
          : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
      }`}
    >
      {/* The LABEL names the control, not the action. It carries aria-pressed,
          so a label that swapped to "show every card" while pressed=false
          would tell a screen-reader user the opposite of what the click does.
          State lives in aria-pressed and in the filled/outlined styling. */}
      🎯 {t("focus.label")}
    </button>
  );
}
