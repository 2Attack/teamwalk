import { describe, expect, it } from 'vitest';

import { buildDailySeries } from '../lib/stats/daily';

/**
 * The series builder owns the chart's data contract: a continuous window of
 * office days ending today, zero-filled, oldest first. The DB rows only carry
 * days that had walks.
 */

const TODAY = '2026-08-18';

describe('buildDailySeries', () => {
  it('produces a continuous ascending window ending today', () => {
    const series = buildDailySeries([], TODAY, 30);
    expect(series).toHaveLength(30);
    expect(series[0].day).toBe('2026-07-20');
    expect(series[29].day).toBe(TODAY);
    // Continuity: every consecutive pair is exactly one day apart.
    for (let i = 1; i < series.length; i += 1) {
      expect(Date.parse(series[i].day) - Date.parse(series[i - 1].day)).toBe(86_400_000);
    }
  });

  it('zero-fills days without walks and places totals on their days', () => {
    const series = buildDailySeries(
      [{ day: '2026-08-15', km: 3.456, durationSec: 3600, walksCount: 2 }],
      TODAY,
      30,
    );
    const hit = series.find((d) => d.day === '2026-08-15');
    expect(hit).toMatchObject({ km: 3.46, durationSec: 3600, walksCount: 2 });
    const zeros = series.filter((d) => d.day !== '2026-08-15');
    expect(zeros).toHaveLength(29);
    for (const d of zeros) expect(d).toMatchObject({ km: 0, durationSec: 0, walksCount: 0 });
  });

  it('drops rows outside the window and rounds km to hundredths', () => {
    const series = buildDailySeries(
      [
        { day: '2026-07-19', km: 9, durationSec: 999, walksCount: 1 },
        { day: TODAY, km: 1.006, durationSec: 60, walksCount: 1 },
      ],
      TODAY,
      30,
    );
    expect(series.some((d) => d.day === '2026-07-19')).toBe(false);
    // Same rounding semantics as the leaderboard's round2.
    expect(series[29].km).toBeCloseTo(1.01, 2);
  });

  it('supports window sizes other than 30', () => {
    const series = buildDailySeries([], TODAY, 7);
    expect(series).toHaveLength(7);
    expect(series[0].day).toBe('2026-08-12');
  });
});
