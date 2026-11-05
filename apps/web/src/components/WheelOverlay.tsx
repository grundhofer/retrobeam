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
import { useNow } from "../lib/useNow.js";
import { useBoardStore } from "../store/boardStore.js";
import { Icon } from "./Icon.js";

// Every client renders the SAME spin from the broadcast seed and lands on the
// same name. Reduced motion (the system's or sebaro's data-sb-motion) and late
// joiners skip straight to the result.
//
// sebaro (plan §2.4 F7, D114): the choosing moment is the app's one moment of
// delight, drawn flat in ink — no participant colours, no gradients, no
// confetti — in sebaro's modal dialog over the scrim; the wheel keeps its
// 4.5 s and stands still under reduced motion.
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

  const localEnd =
    spin === null ? 0 : spin.startAt - clockOffsetMs + spin.durationMs;
  const activeSpin = spin !== null && now <= localEnd + WHEEL_HOLD_MS;
  useEffect(() => {
    if (activeSpin && cardSelectionOpen) onCloseCardSelection();
  }, [activeSpin, cardSelectionOpen, onCloseCardSelection]);

  if (activeSpin && spin !== null) {
    return (
      <SpinScene
        key={spin.startAt}
        spin={spin}
        roster={roster}
        clockOffsetMs={clockOffsetMs}
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

// Both scenes are a modal <dialog> (sebaro's dialog surface over its scrim):
// the page behind is inert while the room watches, and the focus goes back to
// where it was when the moment is over. Escape closes the card choice; the
// spin closes itself when its hold is over, the same on every screen, so
// Escape does nothing there.
function MomentDialog({
  labelledBy,
  testId,
  onCancel,
  children,
}: {
  labelledBy: string;
  testId: string;
  onCancel: (() => void) | null;
  children: React.ReactNode;
}) {
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
      // Escape is taken on keydown: the browser may skip a cancelable
      // `cancel` (Chromium's close watcher, without a fresh user activation)
      // and close the dialog regardless.
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        onCancel?.();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onCancel?.();
      }}
      // Closed anyway (some other path): a spin stays on screen until its
      // hold is over, so it opens again.
      onClose={() => {
        if (onCancel === null) ref.current?.showModal();
      }}
    >
      {children}
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
      onCancel={onClose}
    >
      <p id={titleId} className="sb-dialog__title">
        {t("picker.title")}
      </p>
      <p className="sb-dialog__text">{t("picker.cardDeckHint", { count })}</p>
      <div className="mt-(--sb-space-4) flex flex-wrap justify-center gap-(--sb-space-3)">
        {Array.from({ length: count }, (_, index) => (
          <button
            key={index}
            type="button"
            data-testid="picker-card"
            aria-label={t("picker.chooseCardAria", { index: index + 1 })}
            aria-pressed={selected === index ? true : undefined}
            disabled={selected !== null}
            onClick={() => choose(index)}
            className={`${CARD_FACE} hover:bg-(--sb-color-hover-fill) disabled:cursor-wait aria-pressed:outline-[3px] aria-pressed:outline-offset-2 aria-pressed:outline-(--sb-color-accent) aria-pressed:outline-solid`}
          >
            <Icon name="help" size={32} />
          </button>
        ))}
      </div>
      <div className="sb-dialog__actions">
        <button type="button" onClick={onClose} className="sb-secondary-action">
          {t("picker.closeCards")}
        </button>
      </div>
    </MomentDialog>
  );
}

// A face-down card: sebaro's card edge in ink, a size between a phone and a
// wall (the dialog wraps them).
const CARD_FACE =
  "flex h-32 w-22 shrink-0 items-center justify-center rounded-(--sb-radius-container) border-2 border-(--sb-color-text) bg-(--sb-color-bg) text-(--sb-color-text)";

function SpinScene({
  spin,
  roster,
  clockOffsetMs,
}: {
  spin: WheelSpin;
  roster: Participant[];
  clockOffsetMs: number;
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
    <MomentDialog labelledBy={titleId} testId="wheel-overlay" onCancel={null}>
      <p id={titleId} className="sb-dialog__title">
        {t("picker.title")}
      </p>
      <div className="flex flex-col items-center gap-(--sb-space-4)">
        {!reducedMotion ? (
          <PickerSkin
            style={pickerStyle}
            spin={spin}
            roster={roster}
            clockOffsetMs={clockOffsetMs}
          />
        ) : null}
        {/* The dialog breaks a forty-character name rather than let it run
            past the window. */}
        <div aria-live="polite" className="min-h-12 max-w-full text-center">
          {landed && winner ? (
            <p
              data-testid="wheel-winner"
              className="reveal-in sb-dialog__title m-0"
            >
              {t("picker.winner", { name: winner.name })}
            </p>
          ) : null}
        </div>
      </div>
    </MomentDialog>
  );
}

// An exhaustive switch with NO default clause, so adding a style to
// `pickerStyles` fails the build here instead of silently rendering the wheel.
// That is what makes "we can add more later" true rather than aspirational.
function PickerSkin({
  style,
  spin,
  roster,
  clockOffsetMs,
}: {
  style: PickerStyle;
  spin: WheelSpin;
  roster: Participant[];
  clockOffsetMs: number;
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
        <Wheel spin={spin} roster={roster} clockOffsetMs={clockOffsetMs} />
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
  const [revealed, setRevealed] = useState(false);
  const winner = roster.find((participant) => participant.id === spin.winnerId);
  const selectedIndex = Math.min(
    spin.cardIndex ?? spin.seed % Math.max(1, spin.pool.length),
    Math.max(0, spin.pool.length - 1),
  );

  useEffect(() => {
    const delay = Math.max(0, spin.startAt - clockOffsetMs - Date.now());
    let raf = 0;
    const timeout = setTimeout(() => {
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => setRevealed(true));
      });
    }, delay);
    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(raf);
    };
  }, [spin.startAt, clockOffsetMs]);

  return (
    <div
      data-testid="card-reveal"
      aria-hidden="true"
      className="flex flex-wrap justify-center gap-(--sb-space-3)"
    >
      {spin.pool.map((participantId, index) => {
        const selected = index === selectedIndex;
        return (
          <div
            key={participantId}
            data-testid="reveal-card"
            data-selected={selected ? "true" : "false"}
            className={`h-32 w-22 shrink-0 transition-opacity duration-(--sb-motion-duration-long) ${
              revealed && !selected ? "opacity-30" : "opacity-100"
            }`}
            style={{ perspective: 900 }}
          >
            <div
              className="relative size-full"
              style={{
                transformStyle: "preserve-3d",
                transform:
                  revealed && selected ? "rotateY(180deg)" : "rotateY(0deg)",
                transition:
                  revealed && selected
                    ? `transform ${spin.durationMs}ms cubic-bezier(0.2, 0.8, 0.2, 1)`
                    : undefined,
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
                  className={`absolute inset-0 ${CARD_FACE} flex-col gap-(--sb-space-2) px-(--sb-space-2) text-center`}
                  style={{
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
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
const RIM_OUTER = 138; // outer bezel
const FACE = 126; // coloured segments
const LABEL_OUTER = 116; // where a name ends, just inside the rim
const LABEL_INNER = 38; // where it may start, clear of the hub
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

function Wheel({
  spin,
  roster,
  clockOffsetMs,
}: {
  spin: WheelSpin;
  roster: Participant[];
  clockOffsetMs: number;
}) {
  const [rotation, setRotation] = useState(0);
  const target = wheelTargetRotation(spin.pool, spin.winnerId, spin.seed);

  useEffect(() => {
    const delay = Math.max(0, spin.startAt - clockOffsetMs - Date.now());
    // double rAF: the browser must paint rotation 0 before the transition runs
    let raf = 0;
    const timeout = setTimeout(() => {
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => setRotation(target));
      });
    }, delay);
    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(raf);
    };
  }, [spin.startAt, clockOffsetMs, target]);

  const count = spin.pool.length;
  const segment = 360 / count;

  return (
    <svg
      data-testid="wheel"
      viewBox="-150 -150 300 300"
      // Bounded by the SHORTER viewport axis, not just by breakpoint: the
      // dialog holds the wheel and the winner, and a fixed size clipped the
      // winner off a phone in landscape.
      className="w-[min(27rem,72vw,52dvh)]"
      aria-hidden="true"
    >
      {/* Flat in ink (F7): the rim, the wedge lines, the names and the
          pointer in the text colour, the wedges in two neutral grounds.
          The colours are sebaro's roles, so the wheel follows the theme. */}
      <circle r={RIM_OUTER} style={{ fill: INK }} />
      <circle r={RIM_OUTER - 4} style={{ fill: GROUND }} />

      <g
        style={{
          transform: `rotate(${rotation}deg)`,
          transition:
            rotation !== 0
              ? `transform ${spin.durationMs}ms cubic-bezier(0.12, 0.85, 0.16, 1)`
              : undefined,
        }}
      >
        {spin.pool.map((participantId, index) => {
          const participant = roster.find((p) => p.id === participantId);
          const name = participant?.name ?? "?";
          const wedge = index % 2 === 0 ? GROUND : TINT;
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
            <g key={participantId}>
              {count === 1 ? (
                <circle r={FACE} style={{ fill: wedge }} />
              ) : (
                <path
                  d={segmentPath(index, count, FACE)}
                  style={{ fill: wedge, stroke: INK }}
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              )}
              <g transform={`rotate(${midAngle})`}>
                <text
                  transform={
                    flipped ? `rotate(180 ${LABEL_OUTER} 0)` : undefined
                  }
                  x={LABEL_OUTER}
                  y={0}
                  textAnchor={flipped ? "start" : "end"}
                  dominantBaseline="central"
                  style={{ fill: INK }}
                  fontSize={fontSize}
                  fontWeight="600"
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
            </g>
          );
        })}
      </g>

      {/* Hub, drawn after the face so it caps the wedge tips. */}
      <circle r="18" style={{ fill: GROUND, stroke: INK }} strokeWidth="2" />

      {/* Pointer at the top, over the rim. */}
      <path
        d={`M -13 ${-RIM_OUTER - 9} L 13 ${-RIM_OUTER - 9} L 0 ${-RIM_OUTER + 17} Z`}
        style={{ fill: INK, stroke: GROUND }}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// sebaro's colour roles for the drawing: ink, the page ground, and the
// neutral fill of a hovered row for every other wedge.
const INK = "var(--sb-color-text)";
const GROUND = "var(--sb-color-bg)";
const TINT = "var(--sb-color-hover-fill)";

const SLOT_CELL_PX = 72;
// Reels stop left→right; the last reel lands exactly at durationMs so the
// winner card (SpinScene's `landed`) appears as the final reel settles.
const SLOT_REEL_STAGGER_MS = 450;

// The slot-machine skin: SLOT_REELS vertical reels of participant avatars that
// all land on the winner (jackpot). Every reel's strip + stop is derived from
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
  return (
    <div
      data-testid="slot-machine"
      aria-hidden="true"
      className="flex gap-(--sb-space-3)"
    >
      {Array.from({ length: SLOT_REELS }, (_, reelIndex) => (
        <Reel
          key={reelIndex}
          spin={spin}
          roster={roster}
          clockOffsetMs={clockOffsetMs}
          reelIndex={reelIndex}
        />
      ))}
    </div>
  );
}

function Reel({
  spin,
  roster,
  clockOffsetMs,
  reelIndex,
}: {
  spin: WheelSpin;
  roster: Participant[];
  clockOffsetMs: number;
  reelIndex: number;
}) {
  const { strip, stopIndex } = useMemo(
    () => slotReel(spin.pool, spin.winnerId, spin.seed, reelIndex),
    [spin.pool, spin.winnerId, spin.seed, reelIndex],
  );
  const [offset, setOffset] = useState(0);
  // Park stopIndex in the middle row of the 3-cell window.
  const finalOffset = -(stopIndex - 1) * SLOT_CELL_PX;
  const durationMs =
    spin.durationMs - (SLOT_REELS - 1 - reelIndex) * SLOT_REEL_STAGGER_MS;

  useEffect(() => {
    const delay = Math.max(0, spin.startAt - clockOffsetMs - Date.now());
    // double rAF: the browser must paint offset 0 before the transition runs
    let raf = 0;
    const timeout = setTimeout(() => {
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => setOffset(finalOffset));
      });
    }, delay);
    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(raf);
    };
  }, [spin.startAt, clockOffsetMs, finalOffset]);

  return (
    <div
      className="relative w-16 overflow-hidden rounded-(--sb-radius-container) border-2 border-(--sb-color-text)"
      style={{ height: SLOT_CELL_PX * 3 }}
    >
      <div
        style={{
          transform: `translateY(${offset}px)`,
          transition:
            offset !== 0
              ? `transform ${durationMs}ms cubic-bezier(0.12, 0.85, 0.16, 1)`
              : undefined,
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
              <span className="sb-avatar sb-avatar--32">
                {nameMonogram(name)}
              </span>
            </div>
          );
        })}
      </div>
      {/* center window highlight */}
      <div
        className="pointer-events-none absolute inset-x-1 top-1/2 -translate-y-1/2 rounded-(--sb-radius-control) border-2 border-(--sb-color-accent)"
        style={{ height: SLOT_CELL_PX }}
      />
    </div>
  );
}

function segmentPath(index: number, count: number, radius: number): string {
  const start = ((index * 360) / count - 90) * (Math.PI / 180);
  const end = (((index + 1) * 360) / count - 90) * (Math.PI / 180);
  const largeArc = 360 / count > 180 ? 1 : 0;
  const x0 = radius * Math.cos(start);
  const y0 = radius * Math.sin(start);
  const x1 = radius * Math.cos(end);
  const y1 = radius * Math.sin(end);
  return `M 0 0 L ${x0} ${y0} A ${radius} ${radius} 0 ${largeArc} 1 ${x1} ${y1} Z`;
}
