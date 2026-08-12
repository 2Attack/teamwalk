import { and, desc, eq, ne, sql } from 'drizzle-orm';

import { TZ } from '../config';
import { db } from '../db';
import { walks } from '../db/schema';
import { ROUTE, positionOnRoute } from '../hints/route';
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
 * Позиция команды на виртуальном маршруте. Сумма — за всё время и по всем участникам:
 * это единственная механика, где сильный ходок складывается со слабым, а не отнимает.
 */
export async function getTeamProgress(): Promise<TeamProgressDto> {
  const [row] = await db
    .select({ totalKm: sumKm })
    .from(walks)
    .where(eq(walks.status, 'finished'));

  const totalKm = round2(row?.totalKm ?? 0);
  const position = positionOnRoute(totalKm);

  return {
    totalKm,
    passed: position.passed,
    next: position.next,
    kmLeft: position.kmLeft,
    progressRatio: position.progressRatio,
    // Копия каталога: вызывающий код не должен иметь возможность испортить общий ROUTE.
    route: ROUTE.map((city) => ({ ...city })),
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
