// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  nameGraphemes,
  nameMonogram,
  SLOT_REELS,
  slotReel,
  WHEEL_HOLD_MS,
  wheelTargetRotation,
  type Participant,
  type PickerStyle,
  type WheelSpin,
} from "@retrobeam/shared";
import { useConnection } from "../lib/connection.js";
import { motionReduced } from "../lib/motion.js";
import {
  cardStage,
  riffleApart,
  slotOffset,
  slotReelEnd,
  wheelAngle,
} from "../lib/pickerMotion.js";
import { useNow } from "../lib/useNow.js";
import { useBoardStore } from "../store/boardStore.js";
import { Icon } from "./Icon.js";

// Every client renders the SAME spin from the broadcast seed and lands on the
// same name. Reduced motion (the system's or sebaro's data-sb-motion) and late
// joiners skip straight to the result.
//
// sebaro (plan §2.4 F7): the choosing moment is the app's one moment of
// delight, drawn flat in ink — no participant colours, no gradients, no
// confetti — in sebaro's modal dialog over the scrim. Its motion (owner,
// 2026-11-09, replacing D114's plain 4.5 s turn): the wheel winds up, ticks,
// crawls and settles; the reels blur, catch and the last one lingers; the
// cards are shuffled, fanned and one is turned. All of it is computed from the
// time since the server's start (lib/pickerMotion), and none of it runs under
// reduced motion.
export function WheelOverlay({
  cardSelectionOpen = false,
  isAdmin = false,
  onCloseCardSelection = () => undefined,
}: {
  cardSelectionOpen?: boolean;
  isAdmin?: boolean;
  onCloseCardSelection?: () => void;
}) {
  const spin = useBoardStore((store) => store.state.lastSpin);
  const roster = useBoardStore((store) => store.state.roster);
  const picker = useBoardStore((store) => store.state.picker);
  const config = useBoardStore((store) => store.state.config);
  const phase = useBoardStore((store) => store.state.phase);
  const clockOffsetMs = useBoardStore((store) => store.clockOffsetMs);
  const now = useNow();
  // „Schließen“ or Escape ends the moment for this person only (sebaro
  // §4.6): the spin goes on for the room, and the next spin shows again.
  const [dismissedSpin, setDismissedSpin] = useState<number | null>(null);

  const localEnd =
    spin === null ? 0 : spin.startAt - clockOffsetMs + spin.durationMs;
  const activeSpin = spin !== null && now <= localEnd + WHEEL_HOLD_MS;
  useEffect(() => {
    if (activeSpin && cardSelectionOpen) onCloseCardSelection();
  }, [activeSpin, cardSelectionOpen, onCloseCardSelection]);

  if (activeSpin && spin !== null) {
    if (dismissedSpin === spin.startAt) return null;
    return (
      <SpinScene
        key={spin.startAt}
        spin={spin}
        roster={roster}
        clockOffsetMs={clockOffsetMs}
        onClose={() => setDismissedSpin(spin.startAt)}
      />
    );
  }

  const cardsSelected = config?.pickerCards ?? false;
  if (
    !cardSelectionOpen ||
    !isAdmin ||
    !cardsSelected ||
    phase !== "present" ||
    picker === null
  ) {
    return null;
  }
  const onlineRemaining = picker.remaining.filter((id) =>
    roster.some((participant) => participant.id === id && participant.online),
  );
  const pool = onlineRemaining.length > 0 ? onlineRemaining : picker.remaining;
  if (pool.length === 0) return null;

  return (
    <CardSelectionScene count={pool.length} onClose={onCloseCardSelection} />
  );
}

// Both scenes are sebaro's dialog that shows instead of asking (spec/02 §4.6,
// RB-7): modal over the scrim, only secondary actions with „Schließen“ last,
// Escape closes, and the focus goes back to where it was.
function MomentDialog({
  labelledBy,
  testId,
  onClose,
  children,
}: {
  labelledBy: string;
  testId: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const back =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      const active = document.activeElement;
      if (
        back?.isConnected &&
        (active === null ||
          active === document.body ||
          !active.isConnected ||
          dialog.contains(active))
      )
        back.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      data-testid={testId}
      aria-labelledby={labelledBy}
      className="sb-dialog m-auto"
      // Closed by the parent's state, so the dialog stays in step with it:
      // the browser's own close is turned into onClose.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {children}
      <div className="sb-dialog__actions">
        <button
          type="button"
          data-testid={`${testId}-close`}
          onClick={onClose}
          className="sb-secondary-action"
        >
          {t("sheet.close")}
        </button>
      </div>
    </dialog>
  );
}

function CardSelectionScene({
  count,
  onClose,
}: {
  count: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { send } = useConnection();
  const [selected, setSelected] = useState<number | null>(null);

  const titleId = useId();

  function choose(index: number) {
    if (selected !== null) return;
    setSelected(index);
    send({ type: "admin.picker.spin", cardIndex: index });
  }

  return (
    <MomentDialog
      labelledBy={titleId}
      testId="card-picker-overlay"
      onClose={onClose}
    >
      <h2 id={titleId} className="sb-dialog__title">
        {t("picker.title")}
      </h2>
      <p className="sb-dialog__text">{t("picker.cardDeckHint", { count })}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        {Array.from({ length: count }, (_, index) => (
          <button
            key={index}
            type="button"
            data-testid="picker-card"
            aria-label={t("picker.chooseCardAria", { index: index + 1 })}
            aria-pressed={selected === index ? true : undefined}
            disabled={selected !== null}
            onClick={() => choose(index)}
            className={`${CARD_FACE} hover:bg-hover-fill disabled:cursor-wait aria-pressed:outline-[3px] aria-pressed:outline-offset-2 aria-pressed:outline-(--sb-color-accent) aria-pressed:outline-solid`}
          >
            <Icon name="help" size={32} />
          </button>
        ))}
      </div>
    </MomentDialog>
  );
}

// A face-down card: sebaro's card edge in ink, a size between a phone and a
// wall (the dialog wraps them).
const CARD_FACE =
  "flex h-32 w-22 shrink-0 items-center justify-center rounded-container border-2 border-text bg-bg text-text";

function SpinScene({
  spin,
  roster,
  clockOffsetMs,
  onClose,
}: {
  spin: WheelSpin;
  roster: Participant[];
  clockOffsetMs: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const now = useNow();
  // Freeze the skin for this spin's lifetime: SpinScene is keyed by
  // spin.startAt, so it captures the style at mount and a mid-spin picker-style
  // change can't remount (and restart) the animation on every client.
  const [pickerStyle] = useState<PickerStyle>(() => {
    const config = useBoardStore.getState().state.config;
    return config?.pickerCards ? "cards" : (config?.pickerStyle ?? "wheel");
  });
  // Read once, when the moment starts: a still scene stays still.
  const [reducedMotion] = useState(() => motionReduced());
  const titleId = useId();

  const localEnd = spin.startAt - clockOffsetMs + spin.durationMs;
  const landed = reducedMotion || now >= localEnd;
  const winner = roster.find((p) => p.id === spin.winnerId);

  return (
    <MomentDialog labelledBy={titleId} testId="wheel-overlay" onClose={onClose}>
      <h2 id={titleId} className="sb-dialog__title">
        {t("picker.title")}
      </h2>
      {!reducedMotion ? (
        <PickerSkin
          style={pickerStyle}
          spin={spin}
          roster={roster}
          clockOffsetMs={clockOffsetMs}
          landedOn={landed ? (winner?.name ?? null) : null}
        />
      ) : null}
      {/* The status sentence of sebaro's wheel: in the page from the start, so
          the name is heard when it appears. */}
      <p role="status" className="sb-dialog__text text-center">
        {landed && winner ? (
          <span data-testid="wheel-winner" className="reveal-in">
            {t("picker.winner", { name: winner.name })}
          </span>
        ) : null}
      </p>
    </MomentDialog>
  );
}

// Milliseconds since the spin's start on the server's clock, one value per
// frame until the spin is over — then it stops asking for frames.
function useSpinElapsed(spin: WheelSpin, clockOffsetMs: number): number {
  const start = spin.startAt - clockOffsetMs;
  const [elapsed, setElapsed] = useState(() => Date.now() - start);
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      const value = Date.now() - start;
      setElapsed(value);
      if (value < spin.durationMs) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [start, spin.durationMs]);
  return elapsed;
}

// An exhaustive switch with NO default clause, so adding a style to
// `pickerStyles` fails the build here instead of silently rendering the wheel.
// That is what makes "we can add more later" true rather than aspirational.
function PickerSkin({
  style,
  spin,
  roster,
  clockOffsetMs,
  landedOn,
}: {
  style: PickerStyle;
  spin: WheelSpin;
  roster: Participant[];
  clockOffsetMs: number;
  landedOn: string | null;
}) {
  switch (style) {
    case "cards":
      return (
        <CardReveal spin={spin} roster={roster} clockOffsetMs={clockOffsetMs} />
      );
    case "slots":
      return (
        <SlotMachine
          spin={spin}
          roster={roster}
          clockOffsetMs={clockOffsetMs}
        />
      );
    case "wheel":
      return (
        <Wheel
          spin={spin}
          roster={roster}
          clockOffsetMs={clockOffsetMs}
          landedOn={landedOn}
        />
      );
  }
}

function CardReveal({
  spin,
  roster,
  clockOffsetMs,
}: {
  spin: WheelSpin;
  roster: Participant[];
  clockOffsetMs: number;
}) {
  const elapsed = useSpinElapsed(spin, clockOffsetMs);
  const stage = elapsed <= 0 ? "gather" : cardStage(elapsed, spin.durationMs);
  const apart = stage === "riffle" && riffleApart(elapsed, spin.durationMs);
  const winner = roster.find((participant) => participant.id === spin.winnerId);
  const count = spin.pool.length;
  const selectedIndex = Math.min(
    spin.cardIndex ?? spin.seed % Math.max(1, count),
    Math.max(0, count - 1),
  );
  const mid = (count - 1) / 2;
  const spread = Math.min(64, 440 / Math.max(1, count - 1));
  const tilt = Math.min(8, 60 / Math.max(1, count));

  // Where card i stands in each stage: a pile, two halves apart and back
  // (the riffle), a fan, the chosen card lifted, and turned in the middle.
  function placement(index: number): string {
    const fanX = (index - mid) * spread;
    const fanY = Math.abs(index - mid) * 10;
    const fanRot = (index - mid) * tilt;
    const selected = index === selectedIndex;
    switch (stage) {
      case "gather":
        return `translate(${index * 1.5}px, ${-index * 1.5}px) rotate(${(index - mid) * 2}deg)`;
      case "riffle":
        return apart
          ? `translate(${index < count / 2 ? -64 : 64}px, 0) rotate(${index < count / 2 ? -5 : 5}deg)`
          : `translate(0, ${-index * 1.5}px) rotate(${index % 2 ? 3 : -3}deg)`;
      case "fan":
        return `translate(${fanX}px, ${fanY}px) rotate(${fanRot}deg)`;
      case "lift":
        return selected
          ? `translate(${fanX}px, ${fanY - 40}px) scale(1.1)`
          : `translate(${fanX}px, ${fanY}px) rotate(${fanRot}deg)`;
      case "reveal":
        return selected
          ? "translate(0, -10px) scale(1.25) rotateY(180deg)"
          : `translate(${fanX}px, ${fanY}px) rotate(${fanRot}deg)`;
    }
  }

  return (
    <div
      data-testid="card-reveal"
      data-stage={stage}
      aria-hidden="true"
      className="relative mx-auto"
      style={{ width: "min(520px, 100%)", height: 240, perspective: 900 }}
    >
      {spin.pool.map((participantId, index) => {
        const selected = index === selectedIndex;
        return (
          <div
            key={participantId}
            data-testid="reveal-card"
            data-selected={selected ? "true" : "false"}
            className={`absolute h-32 w-22 transition-opacity duration-(--sb-motion-duration-long) ${
              stage === "reveal" && !selected ? "opacity-30" : "opacity-100"
            }`}
            style={{
              left: "calc(50% - 2.75rem)",
              top: "calc(50% - 4rem)",
              zIndex:
                selected && (stage === "lift" || stage === "reveal") ? 2 : 1,
              transformStyle: "preserve-3d",
              transform: placement(index),
              transition: `transform ${stage === "reveal" ? 600 : 400}ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 200ms`,
            }}
          >
            <div
              className={`absolute inset-0 ${CARD_FACE}`}
              style={{ backfaceVisibility: "hidden" }}
            >
              <Icon name="help" size={32} />
            </div>
            {selected ? (
              <div
                className={`absolute inset-0 ${CARD_FACE} flex-col gap-2 px-2 text-center`}
                style={{
                  backfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                  borderColor: "var(--sb-color-accent)",
                }}
              >
                <span className="sb-avatar sb-avatar--32">
                  {nameMonogram(winner?.name ?? "?")}
                </span>
                <span className="max-w-full truncate font-semibold">
                  {winner?.name ?? "?"}
                </span>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// --- wheel geometry -------------------------------------------------------
// One place for the numbers, because the label layout and the rim have to
// agree: a name is written ALONG its radius (hub → rim), so what bounds its
// length is a distance, not the segment's arc — which is the whole reason
// names no longer have to be cut off.
const FACE = 126; // sebaro's ink circle
const LABEL_OUTER = 116; // where a name ends, just inside the circle
const LABEL_INNER = 30; // where it may start, clear of the centre
const LABEL_SPAN = LABEL_OUTER - LABEL_INNER;
const LABEL_MAX_PX = 17;
const LABEL_MIN_PX = 8.5;
// A semibold Latin sans averages ~0.55em per character. CJK, Hangul and emoji
// are full-width — roughly 1em — and using the Latin figure for them
// under-measures a name by about half, which is exactly how a label overruns.
// Worse, the textLength backstop below would never fire, because it was
// computed from the same wrong number.
const LATIN_EM = 0.55;
const WIDE_EM = 1;
const WIDE =
  /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}|\p{Extended_Pictographic}/u;

/** Name width in em units, measured per grapheme. */
function labelWidthEm(graphemes: readonly string[]): number {
  let em = 0;
  for (const g of graphemes) em += WIDE.test(g) ? WIDE_EM : LATIN_EM;
  return em;
}

function labelSize(widthEm: number, count: number): number {
  const byLength = LABEL_SPAN / Math.max(0.5, widthEm);
  // A tall glyph must also fit ACROSS the segment at the label's inner end,
  // where the wedge is narrowest — otherwise 15 names on one wheel collide.
  const byWedge = ((2 * Math.PI * LABEL_INNER) / count) * 0.78;
  return Math.max(LABEL_MIN_PX, Math.min(LABEL_MAX_PX, byLength, byWedge));
}

// sebaro's wheel (spec/02 §3.29, §4.6, RB-7): svg.sb-wheel, a 2 px ink
// circle, 1.5 px spokes and the names inside g.sb-wheel__disc, the pointer at
// the top; its colours and strokes come from sebaro's CSS. It winds up,
// spins, crawls and settles over the spin's time, the pointer ticking at
// every name (owner, 2026-11-09: a deviation from sebaro's 200 ms, as D114
// was), and the chosen name's wedge lights up when it stands.
function Wheel({
  spin,
  roster,
  clockOffsetMs,
  landedOn,
}: {
  spin: WheelSpin;
  roster: Participant[];
  clockOffsetMs: number;
  landedOn: string | null;
}) {
  const { t } = useTranslation();
  const target = wheelTargetRotation(spin.pool, spin.winnerId, spin.seed);
  const elapsed = useSpinElapsed(spin, clockOffsetMs);
  const rotation = wheelAngle(elapsed, spin.durationMs, target);
  const count = spin.pool.length;
  const segment = 360 / count;
  // The pointer flicks back as a spoke passes under it and returns as the
  // disc turns on — a function of the angle, like a pointer caught by a peg,
  // so every screen draws the same flick.
  const kick = pointerKick(rotation, segment);
  const standing = elapsed >= spin.durationMs;
  const winnerIndex = spin.pool.indexOf(spin.winnerId);
  const wedge = (() => {
    if (winnerIndex < 0 || count < 2) return null;
    const a0 = ((winnerIndex * segment - 90) * Math.PI) / 180;
    const a1 = (((winnerIndex + 1) * segment - 90) * Math.PI) / 180;
    const large = segment > 180 ? 1 : 0;
    return `M0 0 L${FACE * Math.cos(a0)} ${FACE * Math.sin(a0)} A${FACE} ${FACE} 0 ${large} 1 ${FACE * Math.cos(a1)} ${FACE * Math.sin(a1)} Z`;
  })();
  const label =
    landedOn === null
      ? t("picker.wheelLabel", { count })
      : t("picker.wheelLabelLanded", { count, name: landedOn });

  return (
    <svg
      data-testid="wheel"
      // From 0 0, as sebaro's disc turns about the middle of the view box
      // counted from its origin; the drawing is moved into the middle.
      viewBox="0 0 300 300"
      role="img"
      aria-label={label}
      className="sb-wheel"
    >
      <g
        className="sb-wheel__disc"
        style={{ ["--sb-wheel-turn" as string]: `${rotation}deg` }}
      >
        <g transform="translate(150 150)">
          {standing && wedge !== null ? (
            <path
              data-testid="wheel-winner-wedge"
              d={wedge}
              style={{
                fill: "var(--sb-color-accent)",
                fillOpacity: 0.22,
                stroke: "none",
              }}
            />
          ) : null}
          <circle r={FACE} />
          {count > 1
            ? spin.pool.map((participantId, index) => {
                const angle = ((index * segment - 90) * Math.PI) / 180;
                return (
                  <line
                    key={participantId}
                    x1={0}
                    y1={0}
                    x2={FACE * Math.cos(angle)}
                    y2={FACE * Math.sin(angle)}
                  />
                );
              })
            : null}
          {spin.pool.map((participantId, index) => {
            const participant = roster.find((p) => p.id === participantId);
            const name = participant?.name ?? "?";
            const midAngle = index * segment + segment / 2 - 90;
            // Left-hand segments would render their radial label upside down;
            // mirroring about the label's outer end fixes the reading direction
            // without moving the text off its own wedge.
            //
            // Computed in the RESTING frame (midAngle + target), not the
            // unrotated one. The wheel comes to a stop at `target`, which is
            // never a multiple of 360 — so deciding the flip pre-rotation left
            // roughly half the names upside down once it stopped, the winner's
            // own included, which is the one everybody reads for the 2.6s hold.
            const restAngle = midAngle + target;
            const flipped = Math.cos((restAngle * Math.PI) / 180) < 0;
            // Measured in GRAPHEMES, not UTF-16 units: "Christian 🤖".length is
            // 12 for 11 characters, and code units are the unit that produced
            // the "C?" bug in the first place.
            const widthEm = labelWidthEm(nameGraphemes(name));
            const fontSize = labelSize(widthEm, count);
            // The chosen size normally fits; when a very long name would still
            // overrun, textLength condenses it into the span rather than
            // clipping it. Either way the WHOLE name is on the wheel.
            const estimated = widthEm * fontSize;
            return (
              <g key={participantId} transform={`rotate(${midAngle})`}>
                <text
                  transform={
                    flipped ? `rotate(180 ${LABEL_OUTER} 0)` : undefined
                  }
                  x={LABEL_OUTER}
                  y={0}
                  textAnchor={flipped ? "start" : "end"}
                  dominantBaseline="central"
                  // The size is fitted to the name and the wedge; sebaro's
                  // 11 px is a floor for a few names, not a fit for fifteen.
                  // Once it stands, the other names step back.
                  style={{
                    fontSize,
                    opacity:
                      standing && participantId !== spin.winnerId ? 0.35 : 1,
                    transition: "opacity 300ms",
                  }}
                  {...(estimated > LABEL_SPAN
                    ? {
                        textLength: LABEL_SPAN,
                        lengthAdjust: "spacingAndGlyphs" as const,
                      }
                    : {})}
                >
                  {name}
                </text>
              </g>
            );
          })}
        </g>
      </g>
      <path
        className="sb-wheel__pointer"
        d="M 141 4 H 159 L 150 28 Z"
        style={{
          transformBox: "view-box",
          transformOrigin: "150px 4px",
          transform: `rotate(${kick}deg)`,
        }}
      />
    </svg>
  );
}

// Degrees the pointer is pushed back, by how far the disc has turned past the
// last spoke.
function pointerKick(rotation: number, segment: number): number {
  const past = (((rotation + segment / 2) % segment) + segment) % segment;
  const reach = Math.min(segment * 0.4, 18);
  return rotation === 0 ? 0 : -16 * Math.max(0, 1 - past / reach);
}

const SLOT_CELL_PX = 72;
const SLOT_REEL_PX = 112;

// The slot-machine skin: SLOT_REELS vertical reels of participant names (full
// names, not initials: two people may share a letter) that all land on the
// winner (jackpot). They blur while fast, stop one after the other, catch with
// a small bounce, the last one lingers; then the win line lights up. Every reel's strip + stop is derived from
// the broadcast seed (slotReel), so all clients — and a mid-spin reconnect —
// show the identical result. Purely visual; the winner is the server's draw.
function SlotMachine({
  spin,
  roster,
  clockOffsetMs,
}: {
  spin: WheelSpin;
  roster: Participant[];
  clockOffsetMs: number;
}) {
  const elapsed = useSpinElapsed(spin, clockOffsetMs);
  const standing = elapsed >= spin.durationMs;
  return (
    <div
      data-testid="slot-machine"
      data-standing={standing ? "true" : "false"}
      aria-hidden="true"
      className="relative mx-auto flex w-fit gap-3 rounded-container border-2 border-text p-3"
    >
      {Array.from({ length: SLOT_REELS }, (_, reelIndex) => (
        <Reel
          key={reelIndex}
          spin={spin}
          roster={roster}
          elapsed={elapsed}
          reelIndex={reelIndex}
        />
      ))}
      {/* the win line across all reels, lit once the last reel stands */}
      <div
        className={`pointer-events-none absolute inset-x-2 top-1/2 -translate-y-1/2 rounded-control border-2 transition-[border-color,box-shadow] duration-(--sb-motion-duration-long) ${
          standing ? "border-(--sb-color-accent)" : "border-border"
        }`}
        style={{
          height: SLOT_CELL_PX,
          boxShadow: standing
            ? "0 0 0 6px color-mix(in srgb, var(--sb-color-accent) 18%, transparent)"
            : "none",
        }}
      />
    </div>
  );
}

function Reel({
  spin,
  roster,
  elapsed,
  reelIndex,
}: {
  spin: WheelSpin;
  roster: Participant[];
  elapsed: number;
  reelIndex: number;
}) {
  const { strip, stopIndex } = useMemo(
    () => slotReel(spin.pool, spin.winnerId, spin.seed, reelIndex),
    [spin.pool, spin.winnerId, spin.seed, reelIndex],
  );
  // Park stopIndex in the middle row of the 3-cell window.
  const finalOffset = -(stopIndex - 1) * SLOT_CELL_PX;
  const { offset, blur } = slotOffset(
    elapsed,
    slotReelEnd(spin.durationMs, reelIndex),
    finalOffset,
  );

  return (
    <div
      className="relative overflow-hidden rounded-control border border-border"
      style={{ height: SLOT_CELL_PX * 3, width: SLOT_REEL_PX }}
    >
      <div
        style={{
          transform: `translateY(${offset}px)`,
          filter: blur ? "blur(1.4px)" : "none",
        }}
      >
        {strip.map((participantId, index) => {
          const participant = roster.find((p) => p.id === participantId);
          const name = participant?.name ?? "?";
          return (
            <div
              key={index}
              className="flex items-center justify-center"
              style={{ height: SLOT_CELL_PX }}
            >
              <span className="max-w-full truncate px-2 font-semibold">
                {name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
