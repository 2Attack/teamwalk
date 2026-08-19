import { NextResponse } from 'next/server';

import type { ApiErrorBody } from '@/lib/api';
import { apiError, handle } from '@/lib/api';
import { STATS_DAYS } from '@/lib/config';
import { getDailyTotals } from '@/lib/db/queries/daily';
import { getUser } from '@/lib/db/queries/users';
import { buildDailySeries } from '@/lib/stats/daily';
import { addOfficeDays, officeDayStart, toOfficeDay } from '@/lib/time';
import type { UserDailyStatsDto } from '@/lib/types';
import { uuidSchema } from '@/lib/validation';
import { m } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/users/:id/daily — last STATS_DAYS office days, zero-filled. */
export function GET(_request: Request, context: RouteContext) {
  return handle<UserDailyStatsDto | ApiErrorBody>(async () => {
    // Validate uuid before querying: Postgres would fail on a malformed value with 500 instead of 400.
    const id = uuidSchema.parse((await context.params).id);

    const user = await getUser(id);
    if (!user) return apiError(404, 'NOT_FOUND', m.apiMessages.userNotFound);

    const today = toOfficeDay();
    const firstDay = addOfficeDays(today, -(STATS_DAYS - 1));
    const rows = await getDailyTotals(id, officeDayStart(firstDay));

    const body: UserDailyStatsDto = { user, days: buildDailySeries(rows, today, STATS_DAYS) };
    return NextResponse.json(body);
  });
}
