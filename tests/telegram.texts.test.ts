import { describe, expect, it } from 'vitest';

import { rejectReason } from '../lib/hints/filter';
import {
  allBusyText,
  autocloseText,
  digestText,
  farewellText,
  finishText,
  freeText,
  helpText,
  relinkedText,
  remindText,
  staleTokenText,
  startText,
  welcomeText,
} from '../lib/telegram/texts';

/**
 * Telegram notification texts. Generators pick templates at
 * random, so each property is checked over a series of calls: one "lucky"
 * run guarantees nothing.
 *
 * Key invariant — the same post-filter as hints: body, weight,
 * food, and health topics must not reach DMs in any template variant.
 * `isSafe` also rejects lines over 160 chars, while a message can be
 * multi-line (finish with achievements) — so the filter runs per line and
 * the overall 400-char limit is checked on the whole text.
 */

const RUNS = 20;

/** Every non-empty line must pass the hint post-filter. */
function expectSafeLines(text: string): void {
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue;
    expect(rejectReason(line), `line failed the post-filter: «${line}»`).toBeNull();
  }
}

/** Common properties of any message: non-empty, no placeholders, ≤ 400, safe. */
function expectWellFormed(text: string): void {
  expect(text.trim().length).toBeGreaterThan(0);
  expect(text, `unsubstituted placeholder in «${text}»`).not.toContain('{{');
  expect(text).not.toContain('}}');
  expect(text.length).toBeLessThanOrEqual(400);
  expectSafeLines(text);
}

describe('startText', () => {
  it('all variants are safe and well-formed at various speeds', () => {
    const speeds = [1, 2.5, 4, 6.5];
    for (let i = 0; i < RUNS; i += 1) {
      const text = startText({
        speedKmh: speeds[i % speeds.length],
        treadmillName: 'Дорожка у окна',
      });
      expectWellFormed(text);
    }
  });
});

describe('finishText', () => {
  /** Representative combos: streak 0/6, achievements or none, rank up / no previous. */
  const inputs = [
    {
      distanceKm: 2.1,
      durationSec: 1860,
      avgSpeedKmh: 4.1,
      streakDays: 0,
      rankCurrent: 5,
      rankPrevious: null,
      achievements: [] as string[],
    },
    {
      distanceKm: 2.1,
      durationSec: 1860,
      avgSpeedKmh: 4.1,
      streakDays: 6,
      rankCurrent: 2,
      rankPrevious: 3,
      achievements: ['Ранняя пташка'],
    },
    {
      distanceKm: 0.5,
      durationSec: 420,
      avgSpeedKmh: 4.3,
      streakDays: 1,
      rankCurrent: 7,
      rankPrevious: 7,
      achievements: ['Ранняя пташка', 'Марафонец'],
    },
    {
      distanceKm: 10,
      durationSec: 7200,
      avgSpeedKmh: 5,
      streakDays: 6,
      rankCurrent: 1,
      rankPrevious: null,
      achievements: [],
    },
  ];

  it('all variants are safe and well-formed', () => {
    for (let i = 0; i < RUNS; i += 1) {
      expectWellFormed(finishText(inputs[i % inputs.length]));
    }
  });

  it('contains the formatted distance', () => {
    for (let i = 0; i < RUNS; i += 1) {
      expect(finishText(inputs[1])).toContain('2.1');
    }
  });
});

describe('autocloseText', () => {
  it('all variants are safe and well-formed', () => {
    for (let i = 0; i < RUNS; i += 1) {
      expectWellFormed(autocloseText());
    }
  });
});

describe('freeText', () => {
  it('all variants are safe across busy durations', () => {
    const busySecs = [0, 40, 60 * 40, 3600, 3600 + 60 * 20, 8 * 3600];
    for (let i = 0; i < RUNS; i += 1) {
      const text = freeText({
        treadmillName: 'Дорожка у окна',
        busySec: busySecs[i % busySecs.length],
      });
      expectWellFormed(text);
      expect(text).toContain('Дорожка у окна');
    }
  });

  it('sub-minute busy time is not mentioned; long durations are in hours', () => {
    for (let i = 0; i < RUNS; i += 1) {
      // 40 seconds: no busy-time phrase at all (an accidental start was cancelled).
      expect(freeText({ treadmillName: 'Т', busySec: 40 })).not.toContain('занята');
      // 40 minutes in minutes, 8 hours in hours — not "480 minutes".
      expect(freeText({ treadmillName: 'Т', busySec: 60 * 40 })).toContain('40 минут');
      const long = freeText({ treadmillName: 'Т', busySec: 8 * 3600 });
      expect(long).toContain('8 часов');
      expect(long).not.toContain('480');
    }
  });
});

describe('allBusyText', () => {
  it('all variants are safe, marked and name the taken treadmill', () => {
    for (let i = 0; i < RUNS; i += 1) {
      const text = allBusyText({ treadmillName: 'Дорожка у окна' });
      expectWellFormed(text);
      // 🔴 mirrors the freed-up 🟢 so both events are scannable in the chat.
      expect(text).toContain('🔴');
      // The taken treadmill is named; the rest stays count-neutral.
      expect(text).toContain('Дорожка у окна');
    }
  });
});

describe('remindText', () => {
  it('all variants are safe across streaks and freezes', () => {
    const inputs = [
      { idleWorkdays: 2, streakDays: 0, freezesLeft: 2 },
      { idleWorkdays: 2, streakDays: 6, freezesLeft: 1 },
      { idleWorkdays: 5, streakDays: 6, freezesLeft: 0 },
      { idleWorkdays: 3, streakDays: 0, freezesLeft: 0 },
    ];
    for (let i = 0; i < RUNS; i += 1) {
      expectWellFormed(remindText(inputs[i % inputs.length]));
    }
  });

  it('with a live streak gives a concrete reason — mentions the streak', () => {
    // Templates are random; it suffices that the streak is mentioned in at
    // least one of 30 runs — otherwise the "streak at risk" angle is lost entirely.
    const texts = Array.from({ length: 30 }, () =>
      remindText({ idleWorkdays: 2, streakDays: 6, freezesLeft: 1 }),
    );
    expect(texts.some((text) => text.toLowerCase().includes('ери'))).toBe(true);
  });
});

describe('digestText', () => {
  const input = {
    weekKm: 38.2,
    passedCity: 'Кострома',
    top: [
      { name: 'Аня', km: 12.4 },
      { name: 'Егор', km: 9.1 },
      { name: 'Маша', km: 7.7 },
    ],
    selfRank: 5 as number | null,
    selfKm: 6.2,
  };

  it('all variants are safe, including a member with no top rank', () => {
    for (let i = 0; i < RUNS; i += 1) {
      expectWellFormed(digestText(input));
      expectWellFormed(digestText({ ...input, selfRank: null, selfKm: 0 }));
    }
  });

  it('contains the top names and the passed city', () => {
    for (let i = 0; i < RUNS; i += 1) {
      const text = digestText(input);
      expect(text).toContain('Аня');
      expect(text).toContain('Егор');
      expect(text).toContain('Маша');
      expect(text).toContain('Кострома');
    }
  });
});

describe('welcomeText / relinkedText', () => {
  it('welcomeText is safe and addresses by name', () => {
    for (let i = 0; i < RUNS; i += 1) {
      const text = welcomeText('Егор');
      expectWellFormed(text);
      expect(text).toContain('Егор');
    }
  });

  it('relinkedText is safe and addresses by name', () => {
    for (let i = 0; i < RUNS; i += 1) {
      const text = relinkedText('Маша');
      expectWellFormed(text);
      expect(text).toContain('Маша');
    }
  });
});

describe('service texts', () => {
  it('helpText is safe and well-formed', () => {
    for (let i = 0; i < RUNS; i += 1) {
      expectWellFormed(helpText());
    }
  });

  it('farewellText is safe and well-formed', () => {
    for (let i = 0; i < RUNS; i += 1) {
      expectWellFormed(farewellText());
    }
  });

  it('staleTokenText is safe and well-formed', () => {
    for (let i = 0; i < RUNS; i += 1) {
      expectWellFormed(staleTokenText());
    }
  });
});
