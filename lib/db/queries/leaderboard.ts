import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { users, walks } from '@/lib/db/schema';
import { getStreakDaysBulk } from '@/lib/game/streak';
import { avgSpeedKmh } from '@/lib/format';
import { officeRange, periodStart } from '@/lib/time';
import type { LeaderboardDto, LeaderboardRowDto } from '@/lib/types';
import type { Period, PeriodSelection } from '@/lib/validation';

/**
 * Leaderboard aggregations. The whole table is built in one
 * `left join` query: a participant with no walks still appears — with zeros,
 * at the bottom.
 */

/** Round to hundredths — DTO km and speed are emitted this way. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** `numeric`/`bigint` arrive from the driver as strings — coerce to number. */
function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Period distance sum; `coalesce` so non-walkers get 0, not null. */
const totalKmExpr = sql<string>`coalesce(sum(${walks.distanceKm}), 0)`;
/** Total period time in seconds. */
const totalDurationExpr = sql<string>`coalesce(sum(${walks.durationSec}), 0)`;
/** `count(w.id)` skips the empty rows produced by the left join. */
const walksCountExpr = sql<string>`count(${walks.id})`;
/**
 * Last walk directly in ISO: the driver returns timestamptz in Postgres'
 * space-separated format, while the DTO requires ISO-8601.
 */
const lastWalkAtExpr = sql<
  string | null
>`to_char(max(${walks.startedAt}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

interface AggregateRow {
  id: string;
  name: string;
  avatarId: string;
  totalKm: string;
  walksCount: string;
  totalDurationSec: string;
  lastWalkAt: string | null;
}

/** Period bounds: presets have no upper bound, a custom range has both. */
function selectionBounds(selection: PeriodSelection): { since: Date; until: Date | null } {
  if (selection.period === 'custom') {
    const { since, until } = officeRange(selection.from, selection.to);
    return { since, until };
  }
  return { since: periodStart(selection.period), until: null };
}

/**
 * Leaderboard rows already in final order:
 * distance desc → total time asc → name asc.
 */
async function aggregate(selection: PeriodSelection): Promise<AggregateRow[]> {
  const { since, until } = selectionBounds(selection);

  return db
    .select({
      id: users.id,
      name: users.name,
      avatarId: users.avatarId,
      totalKm: totalKmExpr,
      walksCount: walksCountExpr,
      totalDurationSec: totalDurationExpr,
      lastWalkAt: lastWalkAtExpr,
    })
    .from(users)
    .leftJoin(
      walks,
      and(
        eq(walks.userId, users.id),
        eq(walks.status, 'finished'),
        gte(walks.startedAt, since),
        ...(until ? [lt(walks.startedAt, until)] : []),
      ),
    )
    .groupBy(users.id, users.name, users.avatarId)
    .orderBy(desc(totalKmExpr), asc(totalDurationExpr), asc(users.name));
}

/**
 * Streaks are period-independent, hence a separate call.
 * If the streak module fails, the leaderboard matters more — show zeros.
 */
async function safeStreaks(userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  try {
    return await getStreakDaysBulk(userIds);
  } catch (error) {
    console.error('[leaderboard] streak calculation failed', error);
    return new Map();
  }
}

export async function getLeaderboard(selection: PeriodSelection): Promise<LeaderboardDto> {
  const aggregated = await aggregate(selection);
  const [streaks, teamTotalKm] = await Promise.all([
    safeStreaks(aggregated.map((row) => row.id)),
    // Always all-time: otherwise the route bar would roll back weekly.
    getTeamTotalKm(),
  ]);

  const rows: LeaderboardRowDto[] = aggregated.map((row, index) => {
    const totalKm = round2(num(row.totalKm));
    const totalDurationSec = num(row.totalDurationSec);

    return {
      // Equal totals get sequential ranks per the sort rules.
      rank: index + 1,
      user: { id: row.id, name: row.name, avatarId: row.avatarId },
      totalKm,
      walksCount: num(row.walksCount),
      totalDurationSec,
      // From actual data, not the speed declared at start.
      avgSpeedKmh: avgSpeedKmh(totalKm, totalDurationSec),
      streakDays: streaks.get(row.id) ?? 0,
      lastWalkAt: row.lastWalkAt,
    };
  });

  return { period: selection.period, rows, teamTotalKm };
}

/** Participant's rank for the period; `null` when no such participant. */
export async function getUserRank(userId: string, period: Period = 'week'): Promise<number | null> {
  const aggregated = await aggregate({ period });
  const index = aggregated.findIndex((row) => row.id === userId);
  return index === -1 ? null : index + 1;
}

export async function getTeamTotalKm(): Promise<number> {
  const { teamTotalKm } = await getTeamStats();
  return teamTotalKm;
}

/** Team totals in one query: all-time km, walk count, participant count. */
export async function getTeamStats(): Promise<{
  teamTotalKm: number;
  walksCount: number;
  usersCount: number;
}> {
  const rows = await db
    .select({
      teamTotalKm: sql<string>`coalesce(sum(${walks.distanceKm}) filter (where ${walks.status} = 'finished'), 0)`,
      walksCount: sql<string>`count(*) filter (where ${walks.status} = 'finished')`,
      usersCount: sql<string>`(select count(*) from ${users})`,
    })
    .from(walks);

  const row = rows[0];

  return {
    teamTotalKm: round2(num(row?.teamTotalKm)),
    walksCount: num(row?.walksCount),
    usersCount: num(row?.usersCount),
  };
}
