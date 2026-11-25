// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

// A person's tone (sebaro FAR-16, v3.1.2): a number from 1 to 12, assigned
// server-side on join in this order, starting again after the last. The
// colour itself is sebaro's (`--sb-person-1` … `-12`, drawn through
// `data-sb-person`), so RetroBeam keeps no palette of its own: the tones hold
// 3:1 on every ground of sebaro's four palettes, and the initials and the
// name still tell people apart, as they always must.
export const PERSON_TONE_COUNT = 12;

// The palette RetroBeam drew from 2026-11-20 until sebaro v3.1.2, in join
// order: the colour stored for a person before the tone existed. Index + 1 is
// that person's tone. Still sent as the deprecated `color` on the wire, so a
// tab left open across the deploy keeps drawing its rings.
export const LEGACY_TONE_COLOURS = [
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

// The palette before 2026-11-20, in the same order.
const OLDER_COLOURS = [
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

// The tone for a colour stored before tones existed: its place in either old
// palette, so two people never end up sharing one; anything else (a value no
// build of ours wrote) folded onto the tones by a stable hash.
export function toneFromColour(stored: string): number {
  const value = stored.toUpperCase();
  for (const palette of [LEGACY_TONE_COLOURS, OLDER_COLOURS]) {
    const index = (palette as readonly string[]).indexOf(value);
    if (index !== -1) return index + 1;
  }
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(hash, 31) + value.charCodeAt(i)) >>> 0;
  }
  return (hash % PERSON_TONE_COUNT) + 1;
}

// The deprecated wire colour for a tone. Remove with `color` once
// PROTOCOL_VERSION has moved on.
export function legacyColourForTone(tone: number): string {
  return LEGACY_TONE_COLOURS[(tone - 1) % PERSON_TONE_COUNT] as string;
}

// The first tone nobody on the board has; once all twelve are taken, the
// order starts again.
export function assignTone(takenTones: readonly number[]): number {
  for (let tone = 1; tone <= PERSON_TONE_COUNT; tone++) {
    if (!takenTones.includes(tone)) return tone;
  }
  return (takenTones.length % PERSON_TONE_COUNT) + 1;
}
