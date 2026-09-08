// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

const SOUND_KEY = "retropolis.sound";

// localStorage can throw (Safari private mode, storage disabled), and the mute
// now fails in the LOUD direction: without a fallback someone clicks 🔕, gets
// silence for this render, and hears the chime again on the next TimerPanel
// remount. Same read/write pair as session.ts, for the same reason.
const memoryFallback = new Map<string, string>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? memoryFallback.get(key) ?? null;
  } catch {
    return memoryFallback.get(key) ?? null;
  }
}

function write(key: string, value: string): void {
  memoryFallback.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable — the memory fallback above still covers this tab
  }
}

// Sound is ON unless this browser explicitly muted it.
//
// It used to be off by default (docs/01 §12 — open offices, calls). That was
// the wrong trade: the timer's entire job is to tell a room that time is up,
// and a room deep in discussion does not watch a counter. A chime nobody
// wanted is one click from silence; a signal nobody heard is not recoverable.
// The open-office case is served by the mute button sitting next to the
// countdown — visible to members, not just the facilitator.
//
// The stored values are unchanged ("1" / "0"), so a browser that already opted
// in or out keeps its choice; only the meaning of ABSENT moved. Anything
// unrecognised reads as ON too — only the "0" the mute button writes silences.
export function soundEnabled(): boolean {
  return read(SOUND_KEY) !== "0";
}

export function setSoundEnabled(enabled: boolean): void {
  write(SOUND_KEY, enabled ? "1" : "0");
}

// ONE context for the tab, never closed.
//
// The old code built an AudioContext per chime and closed it 1.2s later. That
// cannot survive the autoplay policy: a context constructed outside a user
// gesture starts `suspended`, and constructing a fresh one later is precisely
// the operation the policy blocks — so the singleton is not an optimisation,
// it is the only shape in which the unlock below works at all. (It also
// sidesteps Chrome's ~6-contexts-per-document cap, which the per-chime
// constructor was one long retro away from hitting.)
let context: AudioContext | null = null;

/** Open (and resume) the audio context. MUST be called from inside a real user
 *  gesture — that is the only moment the browser will let a context start.
 *  Idempotent, and safe to call when Web Audio is unavailable. */
export function unlockAudio(): void {
  try {
    context ??= new window.AudioContext();
    // Not just on the first call: iOS/Safari move a running context to
    // `suspended`/`interrupted` when the tab backgrounds or the device locks.
    if (context.state !== "running") void context.resume();
  } catch {
    // audio unavailable — playTimerChime() degrades to silence
  }
}

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
    // Drop the node graph once it has played; the context itself stays.
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
}

// A soft two-tone chime via raw Web Audio (~no dependency).
export function playTimerChime(): void {
  unlockAudio();
  const ctx = context;
  if (ctx === null) return;
  if (ctx.state === "running") {
    schedule(ctx);
    return;
  }
  // Scheduling into a SUSPENDED context does not drop the notes: currentTime
  // is frozen, so they fire whenever the user next clicks — a timer alert
  // minutes late, in a different phase, which is worse than silence.
  //
  // Waiting for the resume is not enough on its own either: a resume() the
  // autoplay policy has not allowed yet is queued and settles only when the
  // page is LATER permitted to start audio, which can be minutes away. So the
  // chime is also on a stopwatch — if the context took more than a moment to
  // start, the moment has passed and the sound is dropped.
  const requestedAt = Date.now();
  void ctx
    .resume()
    .then(() => {
      if (ctx.state === "running" && Date.now() - requestedAt < 2000) {
        schedule(ctx);
      }
    })
    .catch(() => {
      // the autoplay policy said no — stay silent
    });
}
