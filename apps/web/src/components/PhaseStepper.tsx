// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
import { Icon } from "./Icon.js";

export interface PhaseStepperProps {
  phase: Phase;
  phasePlan: PhasePlan;
  isAdmin: boolean;
  /** Where the bottom block goes: the end of the board's view. */
  actionSlot?: HTMLElement | null;
  /** The time box's words for the line under the bars (sebaro RB-1:
   *  „Vorstellen · noch 3 Min.“), or nothing. */
  timeLeft?: ReactNode;
}

// The always-visible answer to "where are we in the retro?" — plus the one
// big button the facilitator drives the session with (product spec §12).
export function PhaseStepper({
  phase,
  phasePlan,
  isAdmin,
  actionSlot = null,
  timeLeft = null,
}: PhaseStepperProps) {
  const { t } = useTranslation();
  const { send } = useConnection();
  const sequence = enabledPhases(phasePlan);
  const currentIndex = sequence.indexOf(phase);
  // sebaro's long form of the steps starts at five (D131).
  const long = sequence.length >= 5;
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
  // first, in sebaro's confirmation dialog. A modal: a double click's second
  // press lands on the backdrop, never on the confirmation.
  //
  // Remembered as the phase it was asked in, and dropped on every phase change
  // by the effect above: a phase that moves on underneath (a co-facilitator, a
  // rewind) closes the dialog (F5b), and coming back to that phase later must
  // not bring it back unasked. The phase check hides it on the very render the
  // phase changes, before the effect has run.
  const confirming = next === "done" && confirmingIn === phase;
  const questionId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirming && !dialog.open) dialog.showModal();
    if (!confirming && dialog.open) dialog.close();
  }, [confirming]);
  const withSlot = (action: ReactNode) =>
    actionSlot ? (
      createPortal(action, actionSlot)
    ) : (
      <div className="sb-bottom-block">
        <div className="sb-primary-action-bar">{action}</div>
      </div>
    );

  return (
    // Two rows: the phase row, and the finish question under it. Not one
    // wrapping row with the question forced onto its own line: a wrapping flex
    // row sizes itself to the sum of its items AND the gaps between them as if
    // they sat on one line, so even a zero-width question added one gap-3 to
    // the stepper, and the centred stepper slid the trigger 6px sideways as
    // the question opened.
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        {/* sebaro's steps (spec/02 §3.12, sb-progress). A retro has 5 to 8
            phases, so it takes the long form (D131): numbered marks, a check
            on the done ones, the words only for screen readers, and one line
            under the bars, „Schritt 3 von 7 · Vorstellen“, at every width.
            React renders that line itself (data-sb-own-now), so sb-fit.js
            writes nothing into this tree; the long form is set on the first
            render, so no word flashes up first. Fewer than 5 steps are left
            to sb-fit.js, which shortens them only where a word does not fit. */}
        <div className="sb-progress min-w-0 flex-[1_1_24rem]">
          <ol
            className="sb-progress__steps"
            aria-label={t("phase.stepper")}
            data-sb-own-now=""
            data-sb-long={long ? "" : undefined}
            data-sb-fit={long ? "short" : undefined}
          >
            {sequence.map((step, index) => (
              <li
                key={step}
                className="sb-progress__step"
                data-sb-state={index < currentIndex ? "done" : undefined}
                aria-current={step === phase ? "step" : undefined}
              >
                {index < currentIndex ? <Icon name="check" size={16} /> : null}
                <span className="sb-progress__word">{t(`phase.${step}`)}</span>
              </li>
            ))}
          </ol>
          <p
            data-testid="phase-compact"
            className="sb-progress__now"
            aria-hidden="true"
          >
            {long
              ? `${t("phase.stepOf", {
                  current: currentIndex + 1,
                  total: sequence.length,
                })} · ${t(`phase.${phase}`)}`
              : t(`phase.${phase}`)}
            {timeLeft ? <> · {timeLeft}</> : null}
          </p>
        </div>
        {isAdmin && (previous !== null || next === "done") ? (
          <div className="flex flex-wrap items-center gap-2">
            {previous !== null ? (
              <button
                type="button"
                data-testid="phase-back"
                disabled={pending !== null}
                onClick={() => step(previous)}
                className="sb-secondary-action sb-secondary-action--compact"
              >
                <Icon name="arrow-left" size={20} />
                {t(`phase.${previous}`)}
              </button>
            ) : null}
            {/* Finishing cannot be taken back, so it asks like a deletion
                (F5b, sebaro D102 (43)): the danger action with the cut and
                no trash, never beside the primary action bar, and a
                confirmation dialog. */}
            {next === "done" ? (
              <button
                type="button"
                data-testid="phase-next"
                disabled={pending !== null}
                aria-haspopup="dialog"
                onClick={() => setConfirmingIn(phase)}
                className="sb-danger-action"
              >
                {t("phase.finish")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {/* The facilitator's primary action is the phase change (F5), in the
          board's action zone (ActionZone), or in a bottom block of its own
          when there is no slot (a test). */}
      {isAdmin && next !== null && next !== "done"
        ? withSlot(
            <button
              type="button"
              data-testid="phase-next"
              disabled={pending !== null}
              onClick={() => step(next)}
              className="sb-primary-action"
            >
              {phase === "lobby"
                ? t("phase.startRetro")
                : `${t("phase.next")}: ${t(`phase.${next}`)}`}
            </button>,
          )
        : null}
      {/* Only while finishing is the next step: once the retro is done the
          dialog leaves with its trigger, and so does the focus that was in
          it, which RetroResults then picks up. */}
      {isAdmin && next === "done" ? (
        <dialog
          ref={dialogRef}
          data-testid="phase-done-question"
          // m-auto: Tailwind's preflight zeroes every margin, also the
          // browser's margin: auto that centres a modal <dialog>, and
          // sebaro.css does not set it back (reported to sebaroDesign).
          className="sb-dialog m-auto"
          aria-labelledby={`${questionId}-title`}
          aria-describedby={`${questionId}-text`}
          onClose={() => setConfirmingIn(null)}
        >
          <p className="sb-dialog__title" id={`${questionId}-title`}>
            {t("phase.finishTitle")}
          </p>
          <p className="sb-dialog__text" id={`${questionId}-text`}>
            {t("phase.finishText")}
          </p>
          <div className="sb-dialog__actions">
            <button
              type="button"
              autoFocus
              onClick={() => setConfirmingIn(null)}
              className="sb-secondary-action"
            >
              {t("note.cancel")}
            </button>
            <button
              type="button"
              data-testid="phase-done-confirm"
              disabled={pending !== null}
              onClick={() => {
                setConfirmingIn(null);
                step("done");
              }}
              className="sb-danger-action sb-danger-action--outlined"
            >
              {t("phase.finish")}
            </button>
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
