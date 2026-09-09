// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, expect, test } from "vitest";
import {
  playTimerChime,
  setSoundEnabled,
  soundEnabled,
  unlockAudio,
} from "./beep.js";

// The key is written out literally on purpose: SOUND_KEY is module-private, and
// the stored "1"/"0" IS the compatibility contract with browsers that made a
// choice under the old default. A test that imported the constant could not
// catch a rename that silently un-mutes everyone who had opted out.
const KEY = "retrobeam.sound";

afterEach(() => localStorage.removeItem(KEY));

test("a browser that never touched the setting hears the chime", () => {
  localStorage.removeItem(KEY);
  expect(soundEnabled()).toBe(true);
});

test('an explicit mute is honoured and stored as "0"', () => {
  setSoundEnabled(false);
  expect(soundEnabled()).toBe(false);
  expect(localStorage.getItem(KEY)).toBe("0");
});

test("a preference stored by the old build still reads as opted in", () => {
  localStorage.setItem(KEY, "1");
  expect(soundEnabled()).toBe(true);
  setSoundEnabled(true);
  expect(localStorage.getItem(KEY)).toBe("1");
});

test("an unrecognised stored value is not a mute", () => {
  localStorage.setItem(KEY, "true");
  expect(soundEnabled()).toBe(true);
});

// The autoplay unlock itself CANNOT be proven here: Playwright launches
// Chromium with --autoplay-policy=no-user-gesture-required, so the context is
// always "running" in this runner and a state assertion would pass vacuously.
// Safari is not in the browser matrix at all. What is worth pinning is that
// neither entry point throws when audio is unavailable or not yet gestured —
// the real behaviour needs a hand check in Safari.
test("unlocking and chiming are idempotent and never throw", () => {
  expect(() => {
    unlockAudio();
    unlockAudio();
    playTimerChime();
  }).not.toThrow();
});
