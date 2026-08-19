import { addOfficeDays } from '@/lib/time';
import type { DailyStatDto } from '@/lib/types';

/** Aggregate row for one office day; only days with walks are present. */
export interface DailyTotalsRow {
  day: string;
  km: number;
  durationSec: number;
  walksCount: number;
}

/** Same rounding as the leaderboard DTOs. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Continuous chart series: `days` office days ending at `today`, oldest
 * first. Days without walks become zeros — the axis must never have holes,
 * or the chart would silently compress idle stretches.
 */
export function buildDailySeries(
  rows: readonly DailyTotalsRow[],
  today: string,
  days: number,
): DailyStatDto[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));

  return Array.from({ length: days }, (_, i) => {
    const day = addOfficeDays(today, i - (days - 1));
    const row = byDay.get(day);
    return {
      day,
      km: round2(row?.km ?? 0),
      durationSec: row?.durationSec ?? 0,
      walksCount: row?.walksCount ?? 0,
    };
  });
}
