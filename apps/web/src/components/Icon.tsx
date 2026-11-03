// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import sprite from "../sebaro/icons/sprite.svg?raw";

// A sebaro icon: a <use> of one of the export's sprite symbols, which
// main.tsx puts into the page once, drawn in currentColor. No path is drawn
// here. At 16 px an icon takes its own 16-unit master where the sprite has
// one (<name>--16, sebaro spec/04 §3); the others are the 24-unit symbol at
// 16 px with the stroke sprite.css gives that size. The masters are read
// from the sprite itself, so a new export brings its own list.
const SYMBOLS = new Set(
  Array.from(sprite.matchAll(/<symbol id="([^"]+)"/g), (match) => match[1]),
);

export type IconSize = 16 | 20 | 24 | 32 | 48;

/** The sprite symbol an icon uses at a size. */
export function symbolOf(name: string, size: IconSize): string {
  if (!SYMBOLS.has(name)) throw new Error(`no sebaro icon "${name}"`);
  return size === 16 && SYMBOLS.has(`${name}--16`) ? `${name}--16` : name;
}

// Decorative by default: the control or text beside it carries the name.
export function Icon({
  name,
  size = 24,
  className,
}: {
  name: string;
  size?: IconSize;
  className?: string;
}) {
  return (
    <svg
      className={`sb-icon sb-icon--${size}${className ? ` ${className}` : ""}`}
      aria-hidden="true"
      focusable="false"
    >
      <use href={`#${symbolOf(name, size)}`} />
    </svg>
  );
}
