// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PhasePlan } from "@retrobeam/shared";
import { useConnection } from "../lib/connection.js";

export interface PhasePlanPanelProps {
  phasePlan: PhasePlan;
  isAdmin: boolean;
  locked: boolean;
}

const OPTIONAL_PHASES = ["checkin", "vote", "discuss", "close"] as const;
const CORE_PHASES = ["write", "present"] as const;

/** The lobby's shared agenda. Core phases stay visible but cannot be removed;
 * optional phases are persisted by the server before the first start. */
export function PhasePlanPanel({
  phasePlan,
  isAdmin,
  locked,
}: PhasePlanPanelProps) {
  const { t } = useTranslation();
  const { send } = useConnection();
  const [pendingPlan, setPendingPlan] = useState<PhasePlan | null>(null);
  const pending =
    pendingPlan !== null &&
    OPTIONAL_PHASES.some((phase) => pendingPlan[phase] !== phasePlan[phase]);

  useEffect(() => {
    if (!pending) return;
    const timeout = setTimeout(() => setPendingPlan(null), 4000);
    return () => clearTimeout(timeout);
  }, [pending, pendingPlan]);

  function toggle(phase: (typeof OPTIONAL_PHASES)[number], enabled: boolean) {
    if (!isAdmin || locked || pending) return;
    const next = { ...phasePlan, [phase]: enabled };
    setPendingPlan(next);
    send({
      type: "admin.phasePlan.set",
      phasePlan: next,
    });
  }

  return (
    <section
      data-testid="phase-plan"
      className="rounded-xl border border-zinc-200 bg-white p-5"
    >
      <div className="mb-4">
        <h2 className="font-semibold text-zinc-900">{t("phasePlan.title")}</h2>
        <p data-testid="phase-plan-hint" className="mt-1 text-sm text-zinc-500">
          {locked
            ? t("phasePlan.locked")
            : isAdmin
              ? t("phasePlan.adminHint")
              : t("phasePlan.memberHint")}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {[
          OPTIONAL_PHASES[0],
          CORE_PHASES[0],
          CORE_PHASES[1],
          OPTIONAL_PHASES[1],
          OPTIONAL_PHASES[2],
          OPTIONAL_PHASES[3],
        ].map((phase) => {
          const optional = OPTIONAL_PHASES.includes(
            phase as (typeof OPTIONAL_PHASES)[number],
          );
          const enabled = optional
            ? phasePlan[phase as (typeof OPTIONAL_PHASES)[number]]
            : true;
          const disabled = !optional || !isAdmin || locked || pending;
          return (
            <label
              key={phase}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
                enabled
                  ? "border-accent/30 bg-accent/[0.04]"
                  : "border-zinc-200 bg-zinc-50"
              } ${disabled ? "cursor-default" : "cursor-pointer"}`}
            >
              <input
                type="checkbox"
                data-testid={`phase-plan-${phase}`}
                checked={enabled}
                disabled={disabled}
                onChange={(event) =>
                  optional &&
                  toggle(
                    phase as (typeof OPTIONAL_PHASES)[number],
                    event.target.checked,
                  )
                }
                className="mt-0.5 accent-accent"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-zinc-800">
                  {t(`phasePlan.phase.${phase}.title`)}
                </span>
                <span className="block text-xs text-zinc-500">
                  {t(`phasePlan.phase.${phase}.description`)}
                  {!optional ? ` · ${t("phasePlan.required")}` : ""}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
