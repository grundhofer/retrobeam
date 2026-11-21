// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

// A short sound when the time box runs out, for whoever switches it on in the
// settings (owner, 2026-11-20, after a test retro: nobody noticed the time was
// up). Off unless this browser chose it — a deviation from sebaro's silent
// time box (D104 (8)), entered in docs/sebaro-luecken.md. The choice is
// stored only while it is on, like `sb-tone` for „Warm“: off removes the
// entry, so a browser that never chose the sound holds nothing. The old key
// `retrobeam.sound` (the chime removed 2026-11-05) is a different one;
// main.tsx still clears it.
const KEY = "retrobeam.timerSound";

// localStorage can throw (Safari private mode, storage disabled): the choice
// then holds for this tab, as session.ts does it.
let memory = false;

export function timerSoundEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return memory;
  }
}

export function setTimerSoundEnabled(enabled: boolean): void {
  memory = enabled;
  try {
    if (enabled) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // storage unavailable: the memory above covers this tab
  }
}

// ONE context for the tab, never closed. A context made outside a click or
// key press starts suspended, and the autoplay policy only lets one start
// inside such a gesture — so it is made (or resumed) there, by unlockAudio,
// and reused when the time runs out. iOS and Safari suspend a running context
// again when the tab goes to the background, hence a resume on every call.
let context: AudioContext | null = null;

/** Start the audio context. Only works inside a real click or key press;
 *  idempotent, and silent where Web Audio is missing. */
export function unlockAudio(): void {
  try {
    context ??= new window.AudioContext();
    if (context.state !== "running") void context.resume();
  } catch {
    // no audio here: playTimerSound stays silent
  }
}

// Two soft sine tones, falling (880 Hz, then 660 Hz), 0.4 s each.
function schedule(ctx: AudioContext): void {
  const now = ctx.currentTime;
  for (const [offset, frequency] of [
    [0, 880],
    [0.18, 660],
  ] as const) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.12, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.45);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
}

export function playTimerSound(): void {
  unlockAudio();
  const ctx = context;
  if (ctx === null) return;
  if (ctx.state === "running") {
    schedule(ctx);
    return;
  }
  // Tones scheduled into a SUSPENDED context are not dropped: they play at
  // the next click, minutes late and in another phase, which is worse than
  // silence. And a resume the autoplay policy has not allowed yet settles only
  // once it is, so the sound is on a stopwatch too: if the context took more
  // than a moment to start, the moment has passed.
  const requestedAt = Date.now();
  void ctx
    .resume()
    .then(() => {
      if (ctx.state === "running" && Date.now() - requestedAt < 2000) {
        schedule(ctx);
      }
    })
    .catch(() => {
      // the autoplay policy said no: stay silent
    });
}
