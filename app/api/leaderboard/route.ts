import { NextResponse } from 'next/server';

import { type ApiErrorBody, handle, validationError } from '@/lib/api';
import { getLeaderboard } from '@/lib/db/queries/leaderboard';
import type { LeaderboardDto } from '@/lib/types';
import { closeStaleWalks } from '@/lib/walks/autoclose';
import { periodSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `GET /api/leaderboard?period=week|month|all` — агрегированный рейтинг (п. 5.3). */
export async function GET(request: Request) {
  return handle<LeaderboardDto | ApiErrorBody>(async () => {
    const raw = new URL(request.url).searchParams.get('period');
    const parsed = periodSchema.safeParse(raw ?? undefined);
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
