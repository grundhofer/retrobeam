// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

// Fixed palette assigned server-side on join: guarantees distinct colors for
// up to 12 participants (typical retro size), then cycles.
//
// Measured 2026-11-20, when the colour came back as a ring around a person's
// initials (owner; plan F6 had dropped it): OKLCH at lightness ~0.58 and
// chroma 0.16, every tone at a relative luminance of about 0.19, so ONE value
// keeps 3:1 (WCAG 1.4.11) against all sixteen grounds of sebaro's light,
// dark, warm and warm-dark palettes (lowest 3.59:1, against #FFFFFF). In
// join order the hues alternate across the circle, so the first eight are far
// apart; from the ninth on they come closer, and the initials and the name
// tell people apart, as they always must — colour is never the only sign.
export const PARTICIPANT_COLORS = [
  "#CE504C",
  "#008792",
  "#768000",
  "#8766D2",
  "#AB6C00",
  "#0D7DD4",
  "#008B5A",
  "#BC549E",
  "#C84F7C",
  "#008978",
  "#907800",
  "#5873DA",
] as const;

// The palette before 2026-11-20, in the same order. Participants who joined
// under it keep their stored value; personColour maps it to the new tone at
// the same place, so two of them never end up sharing one.
const LEGACY_PARTICIPANT_COLORS = [
  "#E8590C",
  "#1971C2",
  "#2F9E44",
  "#9C36B5",
  "#E64980",
  "#0C8599",
  "#E8B50C",
  "#5F3DC4",
  "#D9480F",
  "#087F5B",
  "#C2255C",
  "#3B5BDB",
] as const;

// The tone to draw for a stored colour: the palette's own value, an old one
// moved to its new place, anything else (a value no build of ours wrote)
// folded onto the palette by a stable hash rather than painted as given.
export function personColour(stored: string): string {
  const value = stored.toUpperCase();
  const current = PARTICIPANT_COLORS.indexOf(
    value as (typeof PARTICIPANT_COLORS)[number],
  );
  if (current !== -1) return PARTICIPANT_COLORS[current] as string;
  const legacy = LEGACY_PARTICIPANT_COLORS.indexOf(
    value as (typeof LEGACY_PARTICIPANT_COLORS)[number],
  );
  if (legacy !== -1) return PARTICIPANT_COLORS[legacy] as string;
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(hash, 31) + value.charCodeAt(i)) >>> 0;
  }
  return PARTICIPANT_COLORS[hash % PARTICIPANT_COLORS.length] as string;
}

export function assignColor(takenColors: readonly string[]): string {
  // Compared as drawn: an old stored value holds its new tone's place.
  const taken = takenColors.map(personColour);
  const free = PARTICIPANT_COLORS.find((c) => !taken.includes(c));
  if (free !== undefined) return free;
  return PARTICIPANT_COLORS[
    takenColors.length % PARTICIPANT_COLORS.length
  ] as string;
}
