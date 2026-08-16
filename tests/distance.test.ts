import { describe, expect, it } from 'vitest';

import { calcDistanceKm, calcSegmentedDistanceKm, formatSpeedTrail } from '@/lib/format';

/** Distance with mid-walk speed changes. */

const START = Date.parse('2026-08-12T09:00:00.000Z');
const min = (n: number) => START + n * 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe('calcSegmentedDistanceKm', () => {
  it('with no speed changes matches the single-speed calculation', () => {
    const segments = [{ speedKmh: 4, startedAt: iso(START) }];

    expect(calcSegmentedDistanceKm(segments, min(30))).toBe(2);
    expect(calcSegmentedDistanceKm(segments, min(30))).toBe(calcDistanceKm(4, 30 * 60));
  });

  it('does not rewrite the past: distance before a change uses the old speed', () => {
    const segments = [
      { speedKmh: 6, startedAt: iso(START) }, // 10 min × 6 = 1.00 km
      { speedKmh: 3, startedAt: iso(min(10)) }, // 10 min × 3 = 0.50 km
    ];

    expect(calcSegmentedDistanceKm(segments, min(20))).toBe(1.5);
    // Slowing down does not take back what accrued: the last speed alone would give 1.00.
    expect(calcSegmentedDistanceKm(segments, min(20))).toBeGreaterThan(calcDistanceKm(3, 20 * 60));
  });

  it('sums several consecutive changes', () => {
    const segments = [
      { speedKmh: 4, startedAt: iso(START) }, // 15 min × 4 = 1.00
      { speedKmh: 5, startedAt: iso(min(15)) }, // 15 min × 5 = 1.25
      { speedKmh: 6, startedAt: iso(min(30)) }, // 30 min × 6 = 3.00
    ];

    expect(calcSegmentedDistanceKm(segments, min(60))).toBe(5.25);
  });

  it('at the moment of a change a zero-length segment adds nothing', () => {
    const segments = [
      { speedKmh: 4, startedAt: iso(START) },
      { speedKmh: 9, startedAt: iso(min(15)) },
    ];

    expect(calcSegmentedDistanceKm(segments, min(15))).toBe(1);
  });

  it('does not go negative when the end precedes a segment start', () => {
    // Only possible when client and server clocks drift apart.
    const segments = [
      { speedKmh: 4, startedAt: iso(START) },
      { speedKmh: 9, startedAt: iso(min(20)) },
    ];

    expect(calcSegmentedDistanceKm(segments, min(10))).toBe(0.67);
  });

  it('an empty list yields zero, not NaN', () => {
    expect(calcSegmentedDistanceKm([], min(10))).toBe(0);
  });

  it('rounds once at the end: a dozen changes accumulate no error', () => {
    // 10 one-minute segments at 6 km/h — exactly 1 km, though each is 0.1 km.
    const segments = Array.from({ length: 10 }, (_, i) => ({
      speedKmh: 6,
      startedAt: iso(min(i)),
    }));

    expect(calcSegmentedDistanceKm(segments, min(10))).toBe(1);
  });
});

describe('formatSpeedTrail', () => {
  it('a single speed — a plain label', () => {
    expect(formatSpeedTrail([4])).toBe('4 км/ч');
  });

  it('multiple speeds are listed in change order', () => {
    expect(formatSpeedTrail([4, 6, 5])).toBe('4 → 6 → 5 км/ч');
  });

  it('a long run of changes collapses: the label stays on one line', () => {
    expect(formatSpeedTrail([4, 5, 6, 5, 4, 3])).toBe('4 → … → 3 км/ч');
  });
});
