// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ICEBREAKER_IDS,
  type IcebreakerId,
  type PhasePlan,
} from "@retrobeam/shared";
import { useConnection } from "../lib/connection.js";
import { Icon } from "./Icon.js";

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
  const id = useId();
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

  // sebaro's form parts (plan stage 5b): the phases as a group of checkboxes,
  // each with its sentence as help; the core phases checked and locked, which
  // says that they always run, without „· Pflichtphase“ (D100 (4)). The
  // check-in's question is an sb-select. Every change applies at once.
  const order = [
    OPTIONAL_PHASES[0],
    CORE_PHASES[0],
    CORE_PHASES[1],
    OPTIONAL_PHASES[1],
    OPTIONAL_PHASES[2],
    OPTIONAL_PHASES[3],
  ];
  return (
    <section
      data-testid="phase-plan"
      aria-labelledby={`${id}-title`}
      className="sb-stack"
    >
      {/* "Plan this retro" is an instruction only the facilitator can
          follow; everyone else is reading the agenda. */}
      <h2 id={`${id}-title`} className="sb-section__title">
        {isAdmin ? t("phasePlan.title") : t("phasePlan.memberTitle")}
      </h2>
      <p data-testid="phase-plan-hint" className="sb-field__help">
        {locked
          ? t("phasePlan.locked")
          : isAdmin
            ? t("phasePlan.adminHint")
            : t("phasePlan.memberHint")}
      </p>
      <fieldset className="sb-choice-row">
        <legend className="sb-visually-hidden">
          {isAdmin ? t("phasePlan.title") : t("phasePlan.memberTitle")}
        </legend>
        <div className="sb-stack">
          {order.map((phase) => {
            const optional = OPTIONAL_PHASES.includes(
              phase as (typeof OPTIONAL_PHASES)[number],
            );
            const enabled = optional
              ? phasePlan[phase as (typeof OPTIONAL_PHASES)[number]]
              : true;
            const disabled = !optional || !isAdmin || locked || pending;
            return (
              <div key={phase} className="sb-stack">
                <div>
                  <label className="sb-checkbox">
                    <input
                      type="checkbox"
                      data-testid={`phase-plan-${phase}`}
                      checked={enabled}
                      disabled={disabled}
                      aria-describedby={`${id}-${phase}`}
                      onChange={(event) =>
                        optional &&
                        toggle(
                          phase as (typeof OPTIONAL_PHASES)[number],
                          event.target.checked,
                        )
                      }
                    />
                    <span>{t(`phasePlan.phase.${phase}.title`)}</span>
                  </label>
                  <p id={`${id}-${phase}`} className="sb-field__help">
                    {t(`phasePlan.phase.${phase}.description`)}
                  </p>
                </div>

                {phase === "checkin" && enabled && isAdmin && !locked ? (
                  <div data-testid="checkin-setup" className="sb-stack">
                    <div className="sb-field">
                      <label
                        htmlFor={`${id}-question`}
                        className="sb-field__label"
                      >
                        {t("phasePlan.checkin.question")}
                      </label>
                      <div className="sb-field__control sb-select">
                        <select
                          id={`${id}-question`}
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
                        >
                          <option value="">
                            {t("phasePlan.checkin.randomOnStart")}
                          </option>
                          {ICEBREAKER_IDS.map((icebreaker) => (
                            <option key={icebreaker} value={icebreaker}>
                              {t(`icebreaker.${icebreaker}`)}
                            </option>
                          ))}
                        </select>
                        <Icon name="chevron-down" />
                      </div>
                    </div>
                    <p>
                      <button
                        type="button"
                        data-testid="icebreaker-shuffle"
                        onClick={() => send({ type: "admin.checkin.shuffle" })}
                        className="sb-secondary-action sb-secondary-action--compact"
                      >
                        <Icon name="shuffle" size={20} />
                        {t("phasePlan.checkin.randomize")}
                      </button>
                    </p>

                    {editingAgreements ? (
                      <form onSubmit={saveAgreements} className="sb-stack">
                        <div className="sb-field">
                          <label
                            htmlFor={`${id}-agreements`}
                            className="sb-field__label"
                          >
                            {t("checkin.agreements")}
                          </label>
                          <div className="sb-field__control">
                            <textarea
                              id={`${id}-agreements`}
                              autoFocus
                              value={agreementsDraft}
                              data-testid="agreements-input"
                              onChange={(event) =>
                                setAgreementsDraft(event.target.value)
                              }
                              maxLength={1000}
                              rows={4}
                            />
                          </div>
                        </div>
                        <div className="sb-cluster">
                          <button
                            type="submit"
                            className="sb-secondary-action sb-secondary-action--compact"
                          >
                            {t("note.save")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingAgreements(false)}
                            className="sb-secondary-action sb-secondary-action--compact"
                          >
                            {t("note.cancel")}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="sb-stack">
                        <p className="sb-field__label">
                          {t("checkin.agreements")}
                        </p>
                        <p className="sb-field__help whitespace-pre-wrap">
                          {workingAgreements.trim() === ""
                            ? t("checkin.agreementsDefault")
                            : workingAgreements}
                        </p>
                        <p>
                          <button
                            type="button"
                            data-testid="agreements-edit"
                            onClick={() => {
                              setAgreementsDraft(workingAgreements);
                              setEditingAgreements(true);
                            }}
                            className="sb-secondary-action sb-secondary-action--compact"
                          >
                            <Icon name="edit" size={20} />
                            {t("checkin.edit")}
                          </button>
                        </p>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </fieldset>
    </section>
  );
}
