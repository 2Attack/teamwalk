import { NextResponse } from 'next/server';

import type { ApiErrorBody } from '@/lib/api';
import { apiError, handle } from '@/lib/api';
import { getUserRank } from '@/lib/db/queries/leaderboard';
import { getUser } from '@/lib/db/queries/users';
import { listUserAchievements } from '@/lib/game/achievements';
import { getPersonalRecord, getUserTotals } from '@/lib/game/progress';
import { getStreak } from '@/lib/game/streak';
import type { UserStatsDto } from '@/lib/types';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/users/:id/stats — серия, рекорд, достижения, позиция в рейтинге (п. 6.8.6). */
export function GET(_request: Request, context: RouteContext) {
  return handle<UserStatsDto | ApiErrorBody>(async () => {
    // Валидация uuid до запроса: иначе Postgres упадёт на кривом значении с 500 вместо 400.
    const id = uuidSchema.parse((await context.params).id);

    const user = await getUser(id);
    if (!user) return apiError(404, 'NOT_FOUND', 'Участник не найден');

    // Блоки независимы — считаем параллельно, чтобы уложиться в бюджет ответа (п. 8).
    const [streak, personalRecord, totals, rank, achievements] = await Promise.all([
      getStreak(id),
      getPersonalRecord(id),
      getUserTotals(id),
      // Позиция — в недельном рейтинге: он открыт по умолчанию (п. 6.8.2).
      getUserRank(id, 'week'),
      listUserAchievements(id),
    ]);

    const body: UserStatsDto = {
      user,
      streak,
      personalRecord,
      totalKm: totals.totalKm,
      walksCount: totals.walksCount,
      rank,
      achievements,
      lastSpeedKmh: totals.lastSpeedKmh,
      lastTreadmillId: totals.lastTreadmillId,
    };

    return NextResponse.json(body);
  });
}
