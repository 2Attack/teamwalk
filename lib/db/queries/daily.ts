import { and, asc, eq, gte, sql } from 'drizzle-orm';

import { TZ } from '@/lib/config';
import { db } from '@/lib/db';
import { walks } from '@/lib/db/schema';
import type { DailyTotalsRow } from '@/lib/stats/daily';

/**
 * Office-day bucket must agree with `toOfficeDay`: both are the local date in
 * the office IANA zone, so a walk that spans midnight lands on its start day —
 * the same attribution streaks and the leaderboard use.
 */
// TZ is inlined, not bound: as a parameter it would number differently in
// SELECT and GROUP BY ($1 vs $5), and Postgres would not match the
// expressions. A config constant, never user input.
const dayExpr = sql<string>`to_char(${walks.startedAt} at time zone ${sql.raw(`'${TZ}'`)}, 'YYYY-MM-DD')`;

/** Per-day totals of finished walks since `since`; only days with walks. */
export async function getDailyTotals(userId: string, since: Date): Promise<DailyTotalsRow[]> {
  const rows = await db
    .select({
      day: dayExpr,
      km: sql<string>`coalesce(sum(${walks.distanceKm}), 0)`,
      durationSec: sql<string>`coalesce(sum(${walks.durationSec}), 0)`,
      walksCount: sql<string>`count(*)`,
    })
    .from(walks)
    .where(
      and(eq(walks.userId, userId), eq(walks.status, 'finished'), gte(walks.startedAt, since)),
    )
    .groupBy(dayExpr)
    .orderBy(asc(dayExpr));

  return rows.map((row) => ({
    day: row.day,
    km: Number(row.km),
    durationSec: Number(row.durationSec),
    walksCount: Number(row.walksCount),
  }));
}
