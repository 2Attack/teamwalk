/**
 * 8-bit interface sounds: Web Audio API synthesis, no audio files and no
 * external requests (the "no third-party requests at runtime" rule).
 *
 * Every function is safe by construction: silent in a background tab (sound
 * from an invisible tab is startling), swallows a blocked AudioContext without
 * console errors and closes the context after playback. Volume is deliberately
 * low — this is an office.
 */

interface Note {
  /** 0 — rest: time passes, no oscillator is created. */
  freqHz: number;
  durSec: number;
}

const GAIN = 0.04;

function playNotes(notes: readonly Note[], wave: OscillatorType = 'square'): void {
  if (typeof window === 'undefined' || document.hidden) return;
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    const gain = ctx.createGain();
    gain.gain.value = GAIN;
    gain.connect(ctx.destination);

    let at = 0;
    for (const { freqHz, durSec } of notes) {
      if (freqHz > 0) {
        const osc = ctx.createOscillator();
        osc.type = wave;
        osc.frequency.value = freqHz;
        osc.connect(gain);
        osc.start(ctx.currentTime + at);
        osc.stop(ctx.currentTime + at + durSec);
      }
      at += durSec;
    }

    // The context is single-use: close it after the tail of the last note.
    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, (at + 0.15) * 1000);
  } catch {
    // Autoplay blocked or the API is stripped down — the UI works without sound.
  }
}

/**
 * Achievement fanfare: "ta-da-da…DA" — quick ascent, a breath-pause
 * and a long high finale. Triangle wave (the NES melody channel).
 */
export function playFanfare(): void {
  playNotes(
    [
      { freqHz: 784, durSec: 0.07 },
      { freqHz: 1046, durSec: 0.07 },
      { freqHz: 1318, durSec: 0.07 },
      { freqHz: 0, durSec: 0.05 },
      { freqHz: 1568, durSec: 0.3 },
    ],
    'triangle',
  );
}

/**
 * Start-countdown tick: one short flat beep per digit, racing-lights
 * style. Square wave — the interface channel, distinct from the fanfare.
 */
export function playCountTick(): void {
  playNotes([{ freqHz: 660, durSec: 0.07 }]);
}

/** Final "GO!" of the countdown: two rising tones, longer than a tick. */
export function playCountGo(): void {
  playNotes([
    { freqHz: 880, durSec: 0.08 },
    { freqHz: 1320, durSec: 0.24 },
  ]);
}
