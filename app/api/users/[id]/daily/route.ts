import { NextResponse } from 'next/server';

import type { ApiErrorBody } from '@/lib/api';
import { apiError, handle, validationError } from '@/lib/api';
import { STATS_DAYS } from '@/lib/config';
import { getDailyTotals } from '@/lib/db/queries/daily';
import { getUser } from '@/lib/db/queries/users';
import { buildDailySeries } from '@/lib/stats/daily';
import { addOfficeDays, diffOfficeDays, officeDayStart, toOfficeDay } from '@/lib/time';
import type { UserDailyStatsDto } from '@/lib/types';
import { dailyRangeSchema, uuidSchema } from '@/lib/validation';
import { m } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/users/:id/daily — zero-filled per-day series.
 * Default window: the last STATS_DAYS office days including today.
 * Custom window: `?from=YYYY-MM-DD&to=YYYY-MM-DD` (both inclusive, ≤ a year).
 */
export function GET(request: Request, context: RouteContext) {
  return handle<UserDailyStatsDto | ApiErrorBody>(async () => {
    // Validate uuid before querying: Postgres would fail on a malformed value with 500 instead of 400.
    const id = uuidSchema.parse((await context.params).id);

    const user = await getUser(id);
    if (!user) return apiError(404, 'NOT_FOUND', m.apiMessages.userNotFound);

    const params = new URL(request.url).searchParams;
    const from = params.get('from');
    const to = params.get('to');

    let firstDay: string;
    let lastDay: string;
    if (from !== null || to !== null) {
      const parsed = dailyRangeSchema.safeParse({ from, to });
      if (!parsed.success) return validationError(parsed.error);
      firstDay = parsed.data.from;
      lastDay = parsed.data.to;
    } else {
      lastDay = toOfficeDay();
      firstDay = addOfficeDays(lastDay, -(STATS_DAYS - 1));
    }

    const rows = await getDailyTotals(
      id,
      officeDayStart(firstDay),
      officeDayStart(addOfficeDays(lastDay, 1)),
    );
    const days = diffOfficeDays(lastDay, firstDay) + 1;

    const body: UserDailyStatsDto = { user, days: buildDailySeries(rows, lastDay, days) };
    return NextResponse.json(body);
  });
}
