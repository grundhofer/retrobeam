// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, expect, test } from "vitest";
import {
  playTimerSound,
  setTimerSoundEnabled,
  timerSoundEnabled,
  unlockAudio,
} from "./timerSound.js";

// Written out, not imported: the key is what the privacy notice names, and
// a rename would leave the notice wrong.
const KEY = "retrobeam.timerSound";

afterEach(() => setTimerSoundEnabled(false));

test("a browser that never chose the sound stays quiet", () => {
  localStorage.removeItem(KEY);
  expect(timerSoundEnabled()).toBe(false);
});

test('switching it on stores "1", switching it off stores nothing', () => {
  setTimerSoundEnabled(true);
  expect(timerSoundEnabled()).toBe(true);
  expect(localStorage.getItem(KEY)).toBe("1");
  setTimerSoundEnabled(false);
  expect(timerSoundEnabled()).toBe(false);
  expect(localStorage.getItem(KEY)).toBeNull();
});

test("the old chime's key does not switch the new sound on", () => {
  localStorage.setItem("retrobeam.sound", "1");
  try {
    expect(timerSoundEnabled()).toBe(false);
  } finally {
    localStorage.removeItem("retrobeam.sound");
  }
});

// The autoplay rule itself cannot be shown here: Playwright starts Chromium
// with --autoplay-policy=no-user-gesture-required, so the context is always
// running in this runner. What is worth pinning is that neither entry point
// throws, with or without audio; the real behaviour needs a hand check.
test("unlocking and playing are idempotent and never throw", () => {
  expect(() => {
    unlockAudio();
    unlockAudio();
    playTimerSound();
  }).not.toThrow();
});
