import { and, desc, eq, ne, sql } from 'drizzle-orm';

import { TZ } from '../config';
import { db } from '../db';
import { getActiveRoute } from '../db/queries/routes';
import { walks } from '../db/schema';
import { positionOnRoute } from '../hints/route';
import type { TeamProgressDto } from '../types';

/**
 * Командная цель и личные рекорды (п. 6.8.2 ТЗ).
 *
 * Ничего из этого не хранится: после удаления прогулки (п. 7.7) сохранённые
 * значения пришлось бы пересчитывать, а расхождение заметил бы каждый.
 */

/** Офисный день прогулки — см. `lib/game/streak.ts`: границы суток по `Europe/Moscow`. */
const officeDayExpr = sql<string>`to_char(${walks.startedAt} AT TIME ZONE ${sql.raw(
  `'${TZ}'`,
)}, 'YYYY-MM-DD')`;

/** numeric приходит строкой; заодно срезаем хвосты после сложения дробей. */
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

  const totalKm = round2(Math.max(0, (row?.totalKm ?? 0) - activeRoute.baseKm));
  const position = positionOnRoute(activeRoute.points, totalKm);

  return {
    totalKm,
    passed: position.passed,
    next: position.next,
    kmLeft: position.kmLeft,
    progressRatio: position.progressRatio,
    route: activeRoute.points,
    mapLayout: activeRoute.mapLayout,
    mapImageUrl:
      activeRoute.id && activeRoute.mapImageVersion
        ? `/api/routes/${activeRoute.id}/image?v=${activeRoute.mapImageVersion}`
        : null,
  };
}

/**
 * Личный рекорд. `excludeWalkId` даёт значение **до** указанной прогулки — так экран
 * успеха понимает, побит ли рекорд именно сейчас (п. 6.8.2).
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

  // Максимум по дням берём в памяти: дней у участника десятки, второй агрегат в SQL
  // потребовал бы подзапроса ради того же результата.
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
  /** Скорость и дорожка последней прогулки — для предвыбора при следующем старте (п. 6.2). */
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
    // Для предвыбора берём последнюю не отменённую прогулку: отменённая длилась секунды
    // и её скорость не отражает привычку участника.
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
