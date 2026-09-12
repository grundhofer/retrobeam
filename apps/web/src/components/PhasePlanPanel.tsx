// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ICEBREAKER_IDS,
  type IcebreakerId,
  type PhasePlan,
} from "@retrobeam/shared";
import { useConnection } from "../lib/connection.js";

export interface PhasePlanPanelProps {
  phasePlan: PhasePlan;
  isAdmin: boolean;
  locked: boolean;
  icebreakerId: IcebreakerId | null;
  workingAgreements: string;
}

const OPTIONAL_PHASES = ["checkin", "vote", "discuss", "close"] as const;
const CORE_PHASES = ["write", "present"] as const;

/** The lobby's shared agenda. Core phases stay visible but cannot be removed;
 * optional phases are persisted by the server before the first start. */
export function PhasePlanPanel({
  phasePlan,
  isAdmin,
  locked,
  icebreakerId,
  workingAgreements,
}: PhasePlanPanelProps) {
  const { t } = useTranslation();
  const { send } = useConnection();
  const [pendingPlan, setPendingPlan] = useState<PhasePlan | null>(null);
  const [editingAgreements, setEditingAgreements] = useState(false);
  const [agreementsDraft, setAgreementsDraft] = useState(workingAgreements);
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

  function saveAgreements(event: React.FormEvent) {
    event.preventDefault();
    send({
      type: "admin.agreements.set",
      text: agreementsDraft.trim(),
    });
    setEditingAgreements(false);
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
            <div
              key={phase}
              className={`rounded-lg border ${
                enabled
                  ? "border-accent/30 bg-accent/[0.04]"
                  : "border-zinc-200 bg-zinc-50"
              } ${
                phase === "checkin" && enabled && isAdmin && !locked
                  ? "sm:col-span-2"
                  : ""
              }`}
            >
              <label
                className={`flex items-start gap-3 px-3 py-2.5 ${
                  disabled ? "cursor-default" : "cursor-pointer"
                }`}
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

              {phase === "checkin" && enabled && isAdmin && !locked ? (
                <div
                  data-testid="checkin-setup"
                  className="border-t border-accent/20 px-3 py-3"
                >
                  <label className="block text-xs font-medium text-zinc-600">
                    {t("phasePlan.checkin.question")}
                    <select
                      data-testid="checkin-question-select"
                      value={icebreakerId ?? ""}
                      onChange={(event) =>
                        send({
                          type: "admin.checkin.question.set",
                          icebreakerId:
                            event.target.value === ""
                              ? null
                              : (event.target.value as IcebreakerId),
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-sm font-normal text-zinc-700 focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <option value="">
                        {t("phasePlan.checkin.randomOnStart")}
                      </option>
                      {ICEBREAKER_IDS.map((id) => (
                        <option key={id} value={id}>
                          {t(`icebreaker.${id}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    data-testid="icebreaker-shuffle"
                    onClick={() => send({ type: "admin.checkin.shuffle" })}
                    className="mt-2 rounded-lg border border-zinc-200 px-3 py-1 text-xs text-zinc-600 hover:bg-white focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    🔀 {t("phasePlan.checkin.randomize")}
                  </button>

                  <div className="mt-4">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-zinc-600">
                        {t("checkin.agreements")}
                      </span>
                      {!editingAgreements ? (
                        <button
                          type="button"
                          data-testid="agreements-edit"
                          onClick={() => {
                            setAgreementsDraft(workingAgreements);
                            setEditingAgreements(true);
                          }}
                          className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:bg-white"
                        >
                          ✎ {t("checkin.edit")}
                        </button>
                      ) : null}
                    </div>
                    {editingAgreements ? (
                      <form onSubmit={saveAgreements}>
                        <textarea
                          autoFocus
                          value={agreementsDraft}
                          data-testid="agreements-input"
                          onChange={(event) =>
                            setAgreementsDraft(event.target.value)
                          }
                          maxLength={1000}
                          rows={4}
                          className="w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent"
                        />
                        <div className="mt-2 flex gap-2">
                          <button
                            type="submit"
                            className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-strong"
                          >
                            {t("note.save")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingAgreements(false)}
                            className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-white"
                          >
                            {t("note.cancel")}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <p className="text-xs whitespace-pre-wrap text-zinc-500">
                        {workingAgreements.trim() === ""
                          ? t("checkin.agreementsDefault")
                          : workingAgreements}
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
