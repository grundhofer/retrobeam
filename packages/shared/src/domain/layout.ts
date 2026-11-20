// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from "zod";
import type { Phase } from "./phases.js";

// A board renders EITHER as classic columns (each a vertical list) or as a
// freeform canvas where notes are placed into labelled zones. A "zone" is just
// a column — so voting, grouping, export and the write-phase privacy filter all
// keep working unchanged; canvas only adds a per-note position.
// Master gate for live cursors. Their 1 Hz client throttle and the server's
// account-wide daily budget make activation safe on the Cloudflare free tier.
// Keep this explicit so an emergency release can hide and reject the feature
// with one change while leaving the rest of the canvas intact.
export const CURSORS_ACTIVATABLE = true;

export const layoutModes = ["columns", "canvas"] as const;
export const layoutModeSchema = z.enum(layoutModes);
export type LayoutMode = z.infer<typeof layoutModeSchema>;

// Canvas positions are normalized fractions INSIDE the note's own zone box, so
// they survive responsive re-tiling and the columns↔canvas toggle (columnId
// stays authoritative). Clamp before sending so a valid drop is never rejected.
export function clampUnit(n: number): number {
  if (Number.isNaN(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

// Which surface the main board area renders. Two decisions, in order: focus
// mode wins whenever somebody is on stage (one card, centered, on every
// screen); otherwise the raw canvas is confined to the write phase and the
// between-presenters overview, and everything that must be read / highlighted /
// voted / discussed routes to a structured surface — which is what keeps every
// later-phase feature working and stays readable.
export type BoardSurface = "columns" | "canvas" | "focus";

export function boardSurface(
  layout: LayoutMode,
  phase: Phase,
  hasPresenter: boolean,
  focusMode: boolean,
  anonymous: boolean,
): BoardSurface {
  // The presenter reader picks cards by author, and an ANONYMOUS board strips
  // authorship from every foreign note — so a member routed there would face
  // an empty screen. Anonymity also turns presenter scoping off entirely
  // (revealFor rule 4), so there is no per-person round to read in the first
  // place. One guard, before either branch that can return "focus".
  const reader = hasPresenter && !anonymous;
  // Focus mode routes ANY board with someone on stage to the centered reader —
  // a columns board included. That is the whole point of the switch: the
  // facilitator shares their screen, and the room should be looking at one
  // card, not hunting it in a grid. Checked before the columns early-return.
  //
  // Required, not defaulted: a defaulted argument fails silently at whichever
  // call site the change missed, and the compiler can enumerate them (the same
  // reasoning NoteReveal gives in notes.ts).
  if (phase === "present" && reader && focusMode) return "focus";
  if (layout === "columns") return "columns";
  switch (phase) {
    case "write":
      return "canvas";
    case "present":
      // Someone on stage → the focused reader; nobody yet → calm canvas overview.
      return reader ? "focus" : "canvas";
    default:
      // vote / discuss (and any structured phase) read specific cards → columns.
      return "columns";
  }
}

// Deterministic pseudo-random position for a note that has no stored position
// yet (e.g. a column board flipped to canvas). Same id → same spot, in-bounds,
// stable across reloads — no data write, no wire traffic.
function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function scatterPos(noteId: string): { x: number; y: number } {
  const hash = hashString(noteId);
  const margin = 0.12;
  const span = 1 - 2 * margin;
  return {
    x: margin + ((hash & 0xffff) / 0xffff) * span,
    y: margin + (((hash >>> 16) & 0xffff) / 0xffff) * span,
  };
}

// A zone (column) can be freely placed/sized on the canvas. Its rectangle is
// normalized [0,1] fractions of a fixed logical world; null = "auto", laid out
// in a row by defaultZoneRect. columnId stays authoritative — rect is only how
// the zone is drawn on a canvas board (ignored in column mode).
export const zoneRectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0.05).max(1),
  h: z.number().min(0.05).max(1),
});
export type ZoneRect = z.infer<typeof zoneRectSchema>;

// The canvas grows downward when a new card fits nowhere (owner, 2026-11-10):
// its height is a multiple of the base world's, in steps, just enough for the
// card that needed room, up to twice the base. Zone rects are fractions of
// the world, so every zone grows with it; the cards keep their distance from
// their zone's top (grownCardY), so the new room is one free band at the
// bottom of each zone rather than slivers between the cards.
export const CANVAS_HEIGHT_MAX = 2;
export const CANVAS_HEIGHT_STEP = 0.25;

/** A card's y on its zone once the canvas grows from `from` to `to` times
 *  the base height: the same distance from the zone's top (the zone's
 *  header, a few pixels, is left out of the sum). */
export function grownCardY(y: number, from: number, to: number): number {
  return (y * from) / to;
}

// Default placement for a zone with no stored rect: an even row across the
// world, so a board that never customized still reads like tidy columns.
export function defaultZoneRect(index: number, count: number): ZoneRect {
  const n = Math.max(1, count);
  const gap = 0.015;
  const w = (1 - gap * (n + 1)) / n;
  return { x: gap + index * (w + gap), y: 0.02, w, h: 0.96 };
}

export function clampZoneRect(rect: ZoneRect): ZoneRect {
  const w = Math.min(1, Math.max(0.05, rect.w));
  const h = Math.min(1, Math.max(0.05, rect.h));
  return {
    w,
    h,
    x: Math.min(1, Math.max(0, rect.x)),
    y: Math.min(1, Math.max(0, rect.y)),
  };
}
