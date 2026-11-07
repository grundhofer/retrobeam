// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { useWide } from "../lib/useNarrow.js";
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
  // sebaro's long form of the steps starts at five (D131). RetroBeam keeps it
  // under 1024 px; from there the steps carry their names (owner, 2026-11-07,
  // „nur Ziffern“ read as too little), where even eight names fit their
  // columns. A deviation from D131, reported to sebaroDesign.
  const wide = useWide();
  const long = sequence.length >= 5 && !wide;
  // sb-fit.js applies D131 itself on every pass (a resize, a theme change)
  // and would put the numbers back. With the names wanted, its two
  // attributes are taken off again in the same task — a MutationObserver
  // runs before layout, so the bars never draw the numbers and its
  // ResizeObserver sees no change to answer.
  const stepsRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const steps = stepsRef.current;
    // Fewer than five steps are sb-fit.js's own to shorten.
    if (!steps || long || sequence.length < 5) return;
    const names = () => {
      if (steps.hasAttribute("data-sb-long"))
        steps.removeAttribute("data-sb-long");
      if (steps.hasAttribute("data-sb-fit"))
        steps.removeAttribute("data-sb-fit");
    };
    names();
    const observer = new MutationObserver(names);
    observer.observe(steps, {
      attributes: true,
      attributeFilter: ["data-sb-long", "data-sb-fit"],
    });
    return () => observer.disconnect();
  }, [long, sequence.length]);
  const nowIndex = Math.max(0, currentIndex);
  const nowAtStart = nowIndex < sequence.length / 2;
  // Offer only steps the server's own transition table would accept, so the UI
  // cannot present a control that is guaranteed to be rejected (a rejection
  // also costs a full resync). From "done" the way back is one step, which
  // reopens the retro.
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
            phases; under 1024 px it takes the long form (D131): numbered marks, a check
            on the done ones, the words only for screen readers, and one line
            under the bars, „Schritt 3 von 7 · Vorstellen“. React renders
            that line itself (data-sb-own-now), so sb-fit.js writes nothing
            into this tree; the long form is set on the first render, so no
            word flashes up first. Wider, the names stand (see stepsRef); with
            fewer than 5 steps sb-fit.js shortens them only where a word does
            not fit. */}
        <div className="sb-progress min-w-0 flex-[1_1_24rem]">
          <ol
            ref={stepsRef}
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
            // as wide as the bars, so its grid meets theirs: sebaro holds
            // every p to the reading measure, and its unlayered rule would
            // win over a utility
            style={{ maxInlineSize: "none" }}
          >
            {/* Under the step it names (owner, 2026-11-07): the line stands
                in the bars' own grid, from the current step to the end in
                the first half, and from the start to the current step,
                end-aligned, in the second, so it never runs out of the row. */}
            <span
              className="grid gap-1"
              style={{
                gridTemplateColumns: `repeat(${sequence.length}, minmax(0, 1fr))`,
              }}
            >
              <span
                className={nowAtStart ? "text-start" : "text-end"}
                style={{
                  gridColumn: nowAtStart
                    ? `${nowIndex + 1} / -1`
                    : `1 / ${nowIndex + 2}`,
                }}
              >
                {long
                  ? `${t("phase.stepOf", {
                      current: currentIndex + 1,
                      total: sequence.length,
                    })} · ${t(`phase.${phase}`)}`
                  : t(`phase.${phase}`)}
                {timeLeft ? <> · {timeLeft}</> : null}
              </span>
            </span>
          </p>
        </div>
        {isAdmin && previous !== null ? (
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
          </div>
        ) : null}
      </div>
      {/* The facilitator's primary action is the phase change (F5), in the
          board's action zone (ActionZone), or in a bottom block of its own
          when there is no slot (a test). Finishing too: it is the natural next
          step and can be taken back from the results (owner, 2026-11-07,
          replacing F5b's danger action and dialog). */}
      {isAdmin && next !== null
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
                : next === "done"
                  ? t("phase.finish")
                  : `${t("phase.next")}: ${t(`phase.${next}`)}`}
            </button>,
          )
        : null}
    </div>
  );
}
