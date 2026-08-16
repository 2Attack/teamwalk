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
import { m } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/users/:id/stats — streak, record, achievements, leaderboard rank (spec § 6.8.6). */
export function GET(_request: Request, context: RouteContext) {
  return handle<UserStatsDto | ApiErrorBody>(async () => {
    // Validate uuid before querying: Postgres would fail on a malformed value with 500 instead of 400.
    const id = uuidSchema.parse((await context.params).id);

    const user = await getUser(id);
    if (!user) return apiError(404, 'NOT_FOUND', m.apiMessages.userNotFound);

    // Independent blocks — computed in parallel to fit the response budget (spec § 8).
    const [streak, personalRecord, totals, rank, achievements] = await Promise.all([
      getStreak(id),
      getPersonalRecord(id),
      getUserTotals(id),
      // Rank uses the weekly leaderboard: the default view (spec § 6.8.2).
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
