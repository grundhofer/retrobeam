// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useSyncExternalStore } from "react";

// „Hell oder Dunkel“ and „Farbton“ as choices (sebaro spec/03 §6.6, spec/09
// §6): the board's More menu and its settings view show the same stored
// choice. The keys, attributes and events are sebaro's: theme-init.js applies
// `sb-theme` and `sb-tone` before the first paint. The tone is written only
// by sb-tone.js (the settings' segmented control and the menu's items with
// data-sb-tone-item), which keeps both in step; this reads it. The theme is
// written by theme-button.js on the website's header and, on the board, by
// setThemeChoice below: the app's counterpart of sb-window.js's
// data-sb-theme-choice, which RetroBeam does not load. One storage, one
// event.

export type ThemeChoice = "system" | "light" | "dark";

/** The three choices in their order, each with its word's i18n key. */
export const THEME_CHOICES = [
  { choice: "system", label: "settings.themeSystem" },
  { choice: "light", label: "settings.themeLight" },
  { choice: "dark", label: "settings.themeDark" },
] as const;
export type Tone = "cool" | "warm";

const root = () => document.documentElement;

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(root(), {
    attributes: true,
    attributeFilter: ["data-theme", "data-sb-tone"],
  });
  return () => observer.disconnect();
}

function themeNow(): ThemeChoice {
  const theme = root().dataset.theme;
  return theme === "light" || theme === "dark" ? theme : "system";
}

function toneNow(): Tone {
  return root().dataset.sbTone === "warm" ? "warm" : "cool";
}

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, themeNow, () => "system");
}

export function useTone(): Tone {
  return useSyncExternalStore(subscribe, toneNow, () => "cool");
}

/** Stores the choice as theme-button.js does: nothing stored follows the
 *  system. */
export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === "system") localStorage.removeItem("sb-theme");
    else localStorage.setItem("sb-theme", choice);
  } catch {
    // storage refused (a private window): the choice still applies now
  }
  if (choice === "system") delete root().dataset.theme;
  else root().dataset.theme = choice;
  document.dispatchEvent(
    new CustomEvent("sb-theme-change", { detail: { theme: choice } }),
  );
}
