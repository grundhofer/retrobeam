// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useId, useRef, useState } from "react";
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
  // The finish question (below) — declared here because the phase-change
  // reset right after clears it as well.
  const [confirmingIn, setConfirmingIn] = useState<Phase | null>(null);
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (lastPhase.current !== phase) {
      lastPhase.current = phase;
      setPending(null);
      setConfirmingIn(null);
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

  // Finishing is the one step nobody can take back ("done" is terminal in
  // canTransition) and it freezes the board for the whole room, so it asks
  // first — the BoardMenu delete pattern: the trigger turns into "Cancel" in
  // place and the confirmation is a SECOND button, never one swapped in under
  // the pointer. Here it goes on its own line below rather than beside: the
  // stepper is centred in the header, so a button appearing beside the
  // trigger would shift the trigger sideways and could slide the confirmation
  // under a double click's second press. Below, that press lands on "Cancel".
  //
  // Remembered as the phase it was asked in, and dropped on every phase change
  // by the effect above: a phase that moves on underneath (a co-facilitator, a
  // rewind) retires the question, and coming back to that phase later must not
  // bring it back unasked. The phase check hides it on the very render the
  // phase changes, before the effect has run.
  const confirming = next === "done" && confirmingIn === phase;
  const questionId = useId();

  return (
    // Two rows: the phase row, and the finish question under it. Not one
    // wrapping row with the question forced onto its own line: a wrapping flex
    // row sizes itself to the sum of its items AND the gaps between them as if
    // they sat on one line, so even a zero-width question added one gap-3 to
    // the stepper, and the centred stepper slid the trigger 6px sideways as
    // the question opened.
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Below `sm` the full row does not fit: seven or eight names are
            some 560px, and that one row made every board page on a phone
            scroll sideways — which also pushed the fixed wheel overlay off
            centre. The phone gets the position and the current phase; the
            list stays in the accessibility tree (sr-only), so a screen reader
            hears the same agenda on every screen, and this line is hidden
            from it to avoid reading the phase twice. */}
        <p
          aria-hidden="true"
          data-testid="phase-compact"
          className="flex items-center gap-2 text-sm text-zinc-500 sm:hidden"
        >
          {t("phase.stepOf", {
            current: sequence.indexOf(phase) + 1,
            total: sequence.length,
          })}
          <span className="text-zinc-300">·</span>
          <span className="rounded-full bg-accent px-2.5 py-0.5 font-medium text-white">
            {t(`phase.${phase}`)}
          </span>
        </p>
        <ol
          className="sr-only flex items-center gap-1 sm:not-sr-only"
          aria-label={t("phase.stepper")}
        >
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
                aria-expanded={next === "done" ? confirming : undefined}
                onClick={() =>
                  next === "done"
                    ? setConfirmingIn(confirming ? null : phase)
                    : step(next)
                }
                className={`rounded-lg border px-3 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 ${
                  confirming
                    ? "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                    : "border-transparent bg-accent text-white hover:bg-accent-strong"
                }`}
              >
                {next === "done" ? (
                  // Both labels share one grid cell, so the button keeps its
                  // width when it flips to "Cancel" and does not move under the
                  // pointer either. The hidden one is out of the accessible name.
                  <span className="grid">
                    <span
                      className={`col-start-1 row-start-1 ${confirming ? "invisible" : ""}`}
                    >
                      {`${t("phase.next")}: ${t("phase.done")}`}
                    </span>
                    <span
                      className={`col-start-1 row-start-1 ${confirming ? "" : "invisible"}`}
                    >
                      {t("note.cancel")}
                    </span>
                  </span>
                ) : phase === "lobby" ? (
                  t("phase.startRetro")
                ) : (
                  `${t("phase.next")}: ${t(`phase.${next}`)}`
                )}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {confirming ? (
        // contain: inline-size keeps this line out of the stepper's intrinsic
        // width. Without it the question's own length widened the stepper
        // and wrapped the whole header at 1440px; now it takes the width the
        // phase row already has and wraps inside it.
        <div
          data-testid="phase-done-question"
          className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5 [contain:inline-size]"
        >
          <p id={questionId} className="text-sm text-zinc-600">
            {t("phase.finishQuestion")}
          </p>
          <button
            type="button"
            data-testid="phase-done-confirm"
            aria-describedby={questionId}
            disabled={pending !== null}
            onClick={() => {
              setConfirmingIn(null);
              step("done");
            }}
            className="rounded-lg bg-accent px-3 py-1 text-sm font-medium text-white hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
          >
            {t("phase.finish")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
