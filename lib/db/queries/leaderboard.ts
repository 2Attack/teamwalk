import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { users, walks } from '@/lib/db/schema';
import { getStreakDaysBulk } from '@/lib/game/streak';
import { avgSpeedKmh } from '@/lib/format';
import { periodStart } from '@/lib/time';
import type { LeaderboardDto, LeaderboardRowDto } from '@/lib/types';
import type { Period } from '@/lib/validation';

/**
 * Агрегации рейтинга (п. 5.3 ТЗ).
 *
 * Вся таблица собирается одним запросом с `left join`: участник без прогулок
 * тоже попадает в рейтинг — с нулями и в конце списка (п. 6.2).
 */

/** Округление до сотых — км и скорость в DTO выдаются именно так. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** `numeric`/`bigint` приходят из драйвера строками — приводим к числу. */
function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Сумма дистанции за период; `coalesce`, чтобы у «не ходивших» был 0, а не null. */
const totalKmExpr = sql<string>`coalesce(sum(${walks.distanceKm}), 0)`;
/** Суммарное время в секундах за период. */
const totalDurationExpr = sql<string>`coalesce(sum(${walks.durationSec}), 0)`;
/** `count(w.id)` не считает строки-пустышки от left join. */
const walksCountExpr = sql<string>`count(${walks.id})`;
/**
 * Последняя прогулка сразу в ISO: драйвер отдаёт timestamptz постгресовым
 * форматом со пробелом, а DTO требует ISO-8601.
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

/**
 * Строки рейтинга уже в нужном порядке (п. 7.8):
 * дистанция desc → общее время asc → имя asc.
 */
async function aggregate(period: Period): Promise<AggregateRow[]> {
  const since = periodStart(period);

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
      ),
    )
    .groupBy(users.id, users.name, users.avatarId)
    .orderBy(desc(totalKmExpr), asc(totalDurationExpr), asc(users.name));
}

/**
 * Серии не зависят от периода (п. 5.3), поэтому берутся отдельным вызовом.
 * Если модуль серий упал — лидерборд важнее, показываем нули.
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

export async function getLeaderboard(period: Period): Promise<LeaderboardDto> {
  const aggregated = await aggregate(period);
  const [streaks, teamTotalKm] = await Promise.all([
    safeStreaks(aggregated.map((row) => row.id)),
    // Всегда за всё время: иначе полоса маршрута еженедельно откатывалась бы (п. 5.3).
    getTeamTotalKm(),
  ]);

  const rows: LeaderboardRowDto[] = aggregated.map((row, index) => {
    const totalKm = round2(num(row.totalKm));
    const totalDurationSec = num(row.totalDurationSec);

    return {
      // Одинаковые суммы получают последовательные номера по правилам сортировки.
      rank: index + 1,
      user: { id: row.id, name: row.name, avatarId: row.avatarId },
      totalKm,
      walksCount: num(row.walksCount),
      totalDurationSec,
      // По фактическим данным, а не по заявленной на старте скорости (п. 6.2).
      avgSpeedKmh: avgSpeedKmh(totalKm, totalDurationSec),
      streakDays: streaks.get(row.id) ?? 0,
      lastWalkAt: row.lastWalkAt,
    };
  });

  return { period, rows, teamTotalKm };
}

/** Позиция участника в рейтинге за период; `null`, если такого участника нет. */
export async function getUserRank(userId: string, period: Period = 'week'): Promise<number | null> {
  const aggregated = await aggregate(period);
  const index = aggregated.findIndex((row) => row.id === userId);
  return index === -1 ? null : index + 1;
}

export async function getTeamTotalKm(): Promise<number> {
  const { teamTotalKm } = await getTeamStats();
  return teamTotalKm;
}

/** Командные итоги одним запросом: км за всё время, число прогулок и участников. */
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
