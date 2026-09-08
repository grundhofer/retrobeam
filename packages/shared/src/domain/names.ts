// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

// Display names are user input, and people put emoji in them ("Christian 🤖").
// A JS string is UTF-16, so `name[0]` on an astral-plane character hands back
// HALF a surrogate pair — an unpaired code unit the browser renders as the
// replacement glyph. That is what turned the avatar row's initials into "C?".
//
// Every place that shortens a name to one or two characters goes through here.

// Intl.Segmenter keeps a ZWJ family or a skin-toned emoji whole; the code-point
// fallback (workerd and every browser have Segmenter, but a stray old runtime
// must not crash a render) can still split such a cluster, yet never produces a
// lone surrogate. Built once, LAZILY. This module is re-exported from the package barrel, so
// the Durable Object imports it too — a top-level constructor would run on
// every cold start for a feature the server never uses.
let segmenter: Intl.Segmenter | null | undefined;

function graphemeSegmenter(): Intl.Segmenter | null {
  if (segmenter !== undefined) return segmenter;
  segmenter =
    typeof Intl !== "undefined" && "Segmenter" in Intl
      ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
      : null;
  return segmenter;
}

/** The name split into user-perceived characters. Use this instead of
 *  `name.length` anywhere a name is measured: `.length` counts UTF-16 code
 *  units, which is the very unit that produced the "C?" bug. */
export function nameGraphemes(name: string): string[] {
  const seg = graphemeSegmenter();
  if (seg === null) return Array.from(name); // code points: never a half pair
  return [...seg.segment(name)].map((entry) => entry.segment);
}

function firstGrapheme(text: string): string {
  if (text === "") return "";
  return nameGraphemes(text)[0] ?? "";
}

// A word that can carry a readable initial. An emoji suffix is decoration, not
// a name part: "Christian 🤖" reads as "C", the way every other single-word
// name in the row does, rather than as a cramped "C🤖" in a 28px circle.
function isWordy(word: string): boolean {
  return /\p{L}|\p{N}/u.test(word);
}

/** One or two letters for an avatar bubble. Falls back to the name's first
 *  grapheme when it contains no letters or digits at all (a name that IS an
 *  emoji still gets a glyph rather than a question mark). */
export function nameInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(isWordy);
  if (words.length === 0) return firstGrapheme(name.trim()).toUpperCase();
  const first = firstGrapheme(words[0] as string);
  const last =
    words.length > 1 ? firstGrapheme(words[words.length - 1] as string) : "";
  return (first + last).toUpperCase();
}

/** A single-character monogram — the slot reel's symbol. */
export function nameMonogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(isWordy);
  const source = words[0] ?? name.trim();
  return firstGrapheme(source).toUpperCase();
}
