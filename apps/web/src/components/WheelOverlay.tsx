// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useMemo, useRef, useState } from "react";
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
import { burstConfetti } from "../lib/confetti.js";
import { useNow } from "../lib/useNow.js";
import { useBoardStore } from "../store/boardStore.js";

// Every client renders the SAME spin from the broadcast seed and lands on the
// same name. Reduced-motion (and late joiners) skip straight to the result.
export function WheelOverlay() {
  const spin = useBoardStore((store) => store.state.lastSpin);
  const roster = useBoardStore((store) => store.state.roster);
  const clockOffsetMs = useBoardStore((store) => store.clockOffsetMs);
  const now = useNow();

  if (spin === null) return null;
  const localEnd = spin.startAt - clockOffsetMs + spin.durationMs;
  if (now > localEnd + WHEEL_HOLD_MS) return null;

  return (
    <SpinScene
      key={spin.startAt}
      spin={spin}
      roster={roster}
      clockOffsetMs={clockOffsetMs}
    />
  );
}

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
  const [pickerStyle] = useState(
    () => useBoardStore.getState().state.config?.pickerStyle ?? "wheel",
  );
  const reducedMotion =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  const localEnd = spin.startAt - clockOffsetMs + spin.durationMs;
  const landed = reducedMotion || now >= localEnd;
  const winner = roster.find((p) => p.id === spin.winnerId);

  const celebrated = useRef(false);
  useEffect(() => {
    if (landed && !celebrated.current) {
      celebrated.current = true;
      void burstConfetti();
    }
  }, [landed]);

  return (
    <div
      data-testid="wheel-overlay"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-zinc-900/75 backdrop-blur-sm"
    >
      {!reducedMotion ? (
        <PickerSkin
          style={pickerStyle}
          spin={spin}
          roster={roster}
          clockOffsetMs={clockOffsetMs}
        />
      ) : null}
      <div aria-live="polite" className="min-h-16 text-center">
        {landed && winner ? (
          <div
            data-testid="wheel-winner"
            className="reveal-in rounded-2xl bg-white px-8 py-4 text-2xl font-semibold text-zinc-900 shadow-xl"
          >
            <span
              aria-hidden="true"
              className="mr-3 inline-block size-4 rounded-full"
              style={{ backgroundColor: winner.color }}
            />
            {t("picker.winner", { name: winner.name })}
          </div>
        ) : null}
      </div>
    </div>
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
      // overlay is a fixed, unscrollable column (wheel + winner card), so a
      // fixed 27rem clipped the winner off a phone in landscape.
      className="w-[min(27rem,88vw,62dvh)] drop-shadow-2xl"
      aria-hidden="true"
    >
      <defs>
        {/* Depth without touching the segment colours: a light sheen towards
            the top-left and a soft vignette at the rim, both painted OVER the
            wedges so every participant colour keeps its identity. */}
        <radialGradient id="wheel-sheen" cx="35%" cy="28%" r="78%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.38" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.06" />
          <stop offset="82%" stopColor="#000000" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
        </radialGradient>
        <linearGradient id="wheel-rim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fdfdfd" />
          <stop offset="50%" stopColor="#d7dbe2" />
          <stop offset="100%" stopColor="#a7aeb9" />
        </linearGradient>
        <linearGradient id="wheel-hub" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#dfe3e9" />
        </linearGradient>
      </defs>

      {/* Bezel — static, so it does not spin with the face. */}
      <circle r={RIM_OUTER} fill="url(#wheel-rim)" />
      <circle
        r={RIM_OUTER - 5}
        fill="none"
        stroke="#20242C"
        strokeOpacity="0.14"
        strokeWidth="1.5"
      />

      <g
        style={{
          transform: `rotate(${rotation}deg)`,
          transition:
            rotation !== 0
              ? `transform ${spin.durationMs}ms cubic-bezier(0.12, 0.85, 0.16, 1)`
              : undefined,
        }}
      >
        <circle r={FACE} fill="#ffffff" />
        {spin.pool.map((participantId, index) => {
          const participant = roster.find((p) => p.id === participantId);
          const color = participant?.color ?? "#9AA1AD";
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
            <g key={participantId}>
              {count === 1 ? (
                <circle r={FACE} fill={color} />
              ) : (
                <path
                  d={segmentPath(index, count, FACE)}
                  fill={color}
                  stroke="#ffffff"
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
                  fill="#ffffff"
                  fontSize={fontSize}
                  fontWeight="600"
                  // A painted outline rather than an feDropShadow: up to a
                  // dozen filter regions re-rasterising every frame of a 4.5s
                  // transform transition is the one real frame-drop risk here,
                  // and the outline reads the same against a mid-tone wedge.
                  paintOrder="stroke"
                  stroke="#00000055"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
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

      {/* Sheen sits OUTSIDE the rotating group: the light source is fixed, like
          the bezel above it. A specular highlight that orbits with the face
          reads as a rotating lamp rather than a spinning disc. */}
      <circle r={FACE} fill="url(#wheel-sheen)" pointerEvents="none" />

      {/* Hub, drawn after the face so it caps the wedge tips. */}
      <circle r="21" fill="#20242C" fillOpacity="0.10" />
      <circle r="18" fill="url(#wheel-hub)" />
      <circle
        r="18"
        fill="none"
        stroke="#20242C"
        strokeOpacity="0.16"
        strokeWidth="1.5"
      />
      <circle r="5" fill="#20242C" fillOpacity="0.22" />

      {/* Pointer at the top, overlapping the bezel so it reads as a physical
          flapper rather than a floating triangle. */}
      <g>
        <path
          d={`M -13 ${-RIM_OUTER - 9} L 13 ${-RIM_OUTER - 9} L 0 ${-RIM_OUTER + 17} Z`}
          fill="#20242C"
          stroke="#ffffff"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

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
      className="flex gap-3 rounded-3xl bg-white p-5 shadow-2xl"
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
      className="relative w-16 overflow-hidden rounded-xl bg-zinc-100"
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
          const color = participant?.color ?? "#9AA1AD";
          const name = participant?.name ?? "?";
          return (
            <div
              key={index}
              className="flex items-center justify-center"
              style={{ height: SLOT_CELL_PX }}
            >
              <span
                className="flex size-12 items-center justify-center rounded-full text-lg font-semibold text-white"
                style={{ backgroundColor: color }}
              >
                {nameMonogram(name)}
              </span>
            </div>
          );
        })}
      </div>
      {/* center window highlight */}
      <div
        className="pointer-events-none absolute inset-x-1 top-1/2 -translate-y-1/2 rounded-lg ring-2 ring-accent/70"
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
