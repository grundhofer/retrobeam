// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  canTransition,
  enabledPhases,
  nextPhase,
  previousPhase,
  type Phase,
  type PhasePlan,
} from "@retrobeam/shared";
import { useConnection } from "../lib/connection.js";

export interface PhaseStepperProps {
  phase: Phase;
  phasePlan: PhasePlan;
  isAdmin: boolean;
}

// The always-visible answer to "where are we in the retro?" — plus the one
// big button the facilitator drives the session with (product spec §12).
export function PhaseStepper({ phase, phasePlan, isAdmin }: PhaseStepperProps) {
  const { t } = useTranslation();
  const { send } = useConnection();
  const sequence = enabledPhases(phasePlan);
  // Offer only steps the server's own transition table would accept, so the UI
  // cannot present a control that is guaranteed to be rejected. "done" is
  // terminal, and it used to render a "← Close" button that failed on every
  // click (a rejection also costs a full resync).
  const step0 = nextPhase(phase, phasePlan);
  const back0 = previousPhase(phase, phasePlan);
  const next =
    step0 !== null && canTransition(phase, step0, phasePlan) ? step0 : null;
  const previous =
    back0 !== null && canTransition(phase, back0, phasePlan) ? back0 : null;

  // A phase step is a round trip: the target is derived from the phase we
  // currently believe we are in. A second click before `phase.changed` lands
  // would re-derive the SAME target, which the server rejects as an illegal
  // self-transition (and the rejection costs a full resync) — so the room
  // silently misses a step. Lock the controls until the server confirms.
  const [pending, setPending] = useState<Phase | null>(null);
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (lastPhase.current !== phase) {
      lastPhase.current = phase;
      setPending(null);
    }
  }, [phase]);
  // Release valve: a refused step (or a dropped socket) never produces a
  // phase.changed, and the facilitator must not be left with dead controls.
  useEffect(() => {
    if (pending === null) return;
    const timeout = setTimeout(() => setPending(null), 4000);
    return () => clearTimeout(timeout);
  }, [pending]);

  function step(target: Phase) {
    if (pending !== null) return;
    setPending(target);
    send({ type: "admin.phase.set", phase: target });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ol className="flex items-center gap-1" aria-label={t("phase.stepper")}>
        {sequence.map((step, index) => (
          <li key={step} className="flex items-center gap-1">
            {index > 0 ? <span className="text-zinc-300">·</span> : null}
            <span
              aria-current={step === phase ? "step" : undefined}
              className={
                step === phase
                  ? "rounded-full bg-accent px-2.5 py-0.5 text-sm font-medium text-white"
                  : "px-1 text-sm text-zinc-400"
              }
            >
              {t(`phase.${step}`)}
            </span>
          </li>
        ))}
      </ol>
      {isAdmin ? (
        <div className="flex items-center gap-1.5">
          {previous !== null ? (
            <button
              type="button"
              data-testid="phase-back"
              disabled={pending !== null}
              onClick={() => step(previous)}
              className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
            >
              ← {t(`phase.${previous}`)}
            </button>
          ) : null}
          {next !== null ? (
            <button
              type="button"
              data-testid="phase-next"
              disabled={pending !== null}
              onClick={() => step(next)}
              className="rounded-lg bg-accent px-3 py-1 text-sm font-medium text-white hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
            >
              {phase === "lobby"
                ? t("phase.startRetro")
                : `${t("phase.next")}: ${t(`phase.${next}`)}`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
