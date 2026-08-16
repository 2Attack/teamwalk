import { and, desc, eq, ne, sql } from 'drizzle-orm';

import { TZ } from '../config';
import { db } from '../db';
import { getActiveRoute } from '../db/queries/routes';
import { walks } from '../db/schema';
import { positionOnRoute } from '../hints/route';
import type { TeamProgressDto } from '../types';

/**
 * Team goal and personal records (spec § 6.8.2). None of it is stored:
 * deleting a walk (spec § 7.7) would require recomputing saved values, and
 * everyone would notice a mismatch.
 */

/** Office day of a walk — see `lib/game/streak.ts`: day boundaries per `Europe/Moscow`. */
const officeDayExpr = sql<string>`to_char(${walks.startedAt} AT TIME ZONE ${sql.raw(
  `'${TZ}'`,
)}, 'YYYY-MM-DD')`;

/** numeric arrives as a string; also trims tails left by fraction addition. */
const round2 = (value: number): number => Math.round(value * 100) / 100;

const sumKm = sql<number>`coalesce(sum(${walks.distanceKm}), 0)`.mapWith(Number);

/**
 * Team position on the virtual route. The sum is all-time across everyone:
 * the only mechanic where a strong walker adds to a weak one, not competes.
 *
 * Since spec § 6.12 the route comes from the DB (with the static fallback) and
 * the position is projected from `teamTotalKm − base_km` — a freshly activated
 * route starts from zero without touching walk history.
 */
export async function getTeamProgress(): Promise<TeamProgressDto> {
  const [[row], activeRoute] = await Promise.all([
    db.select({ totalKm: sumKm }).from(walks).where(eq(walks.status, 'finished')),
    getActiveRoute(),
  ]);

  // No route selected (spec § 6.12.6): a legitimate state, not an error —
  // the team total is still worth showing.
  if (activeRoute.points.length < 2) {
    return {
      totalKm: round2(row?.totalKm ?? 0),
      passed: null,
      next: null,
      kmLeft: 0,
      progressRatio: 0,
      route: [],
    };
  }

  const totalKm = round2(Math.max(0, (row?.totalKm ?? 0) - activeRoute.baseKm));
  const position = positionOnRoute(activeRoute.points, totalKm);

  return {
    totalKm,
    passed: position.passed,
    next: position.next,
    kmLeft: position.kmLeft,
    progressRatio: position.progressRatio,
    route: activeRoute.points,
  };
}

/**
 * Personal record. `excludeWalkId` yields the value **before** the given walk —
 * that's how the success screen knows the record was beaten just now (spec § 6.8.2).
 */
export async function getPersonalRecord(
  userId: string,
  excludeWalkId?: string,
): Promise<{ bestDayKm: number; bestWalkKm: number }> {
  const rows = await db
    .select({
      dayKm: sumKm,
      bestWalkKm: sql<number>`coalesce(max(${walks.distanceKm}), 0)`.mapWith(Number),
    })
    .from(walks)
    .where(
      and(
        eq(walks.userId, userId),
        eq(walks.status, 'finished'),
        excludeWalkId ? ne(walks.id, excludeWalkId) : undefined,
      ),
    )
    .groupBy(officeDayExpr);

  // Daily max is taken in memory: a participant has tens of days, and a second
  // SQL aggregate would need a subquery for the same result.
  let bestDayKm = 0;
  let bestWalkKm = 0;
  for (const row of rows) {
    if (row.dayKm > bestDayKm) bestDayKm = row.dayKm;
    if (row.bestWalkKm > bestWalkKm) bestWalkKm = row.bestWalkKm;
  }

  return { bestDayKm: round2(bestDayKm), bestWalkKm: round2(bestWalkKm) };
}

export interface UserTotals {
  totalKm: number;
  walksCount: number;
  /** Speed and treadmill of the last walk — preselected on the next start (spec § 6.2). */
  lastSpeedKmh: number | null;
  lastTreadmillId: string | null;
}

export async function getUserTotals(userId: string): Promise<UserTotals> {
  const [totals, last] = await Promise.all([
    db
      .select({ totalKm: sumKm, walksCount: sql<number>`count(*)`.mapWith(Number) })
      .from(walks)
      .where(and(eq(walks.userId, userId), eq(walks.status, 'finished')))
      .then((rows) => rows[0]),
    // Preselect from the last non-cancelled walk: a cancelled one lasted seconds
    // and its speed reflects no habit.
    db
      .select({ speedKmh: walks.speedKmh, treadmillId: walks.treadmillId })
      .from(walks)
      .where(and(eq(walks.userId, userId), ne(walks.status, 'cancelled')))
      .orderBy(desc(walks.startedAt))
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  return {
    totalKm: round2(totals?.totalKm ?? 0),
    walksCount: totals?.walksCount ?? 0,
    lastSpeedKmh: last?.speedKmh ?? null,
    lastTreadmillId: last?.treadmillId ?? null,
  };
}
