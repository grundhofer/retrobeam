// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

// Whether motion is to be left out: the system's setting, or sebaro's own
// switch, data-sb-motion="reduce" on the page or on any container around the
// element (sebaro D80; plan §5.5). Read when a moment starts, not watched.
export function motionReduced(element?: Element | null): boolean {
  if (
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return true;
  if (typeof document === "undefined") return false;
  const scope = element ?? document.documentElement;
  return scope.closest('[data-sb-motion="reduce"]') !== null;
}
