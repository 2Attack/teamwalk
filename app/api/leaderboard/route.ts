import { NextResponse } from 'next/server';

import { type ApiErrorBody, handle, validationError } from '@/lib/api';
import { getLeaderboard } from '@/lib/db/queries/leaderboard';
import type { LeaderboardDto } from '@/lib/types';
import { closeStaleWalks } from '@/lib/walks/autoclose';
import { periodSelectionSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/leaderboard?period=week|month|all` — агрегированный рейтинг (п. 5.3).
 * Произвольный период: `?period=custom&from=YYYY-MM-DD&to=YYYY-MM-DD` (обе даты включительно).
 */
export async function GET(request: Request) {
  return handle<LeaderboardDto | ApiErrorBody>(async () => {
    const params = new URL(request.url).searchParams;
    const parsed = periodSelectionSchema.safeParse({
      period: params.get('period') ?? undefined,
      from: params.get('from') ?? undefined,
      to: params.get('to') ?? undefined,
    });
    if (!parsed.success) return validationError(parsed.error);

    // Забытые прогулки закрываются перед выдачей рейтинга (п. 7.6):
    // иначе они висят «активными» и не попадают в суммы.
    try {
      await closeStaleWalks();
    } catch (error) {
      console.error('[leaderboard] autoclose failed', error);
    }

    return NextResponse.json(await getLeaderboard(parsed.data));
  });
}
