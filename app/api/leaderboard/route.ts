import { NextResponse } from 'next/server';

import { type ApiErrorBody, handle, validationError } from '@/lib/api';
import { getLeaderboard } from '@/lib/db/queries/leaderboard';
import { ensureNotifySweep } from '@/lib/telegram/sweep';
import type { LeaderboardDto } from '@/lib/types';
import { closeStaleWalks } from '@/lib/walks/autoclose';
import { periodSelectionSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/leaderboard?period=week|month|all` — aggregated ranking (spec § 5.3).
 * Custom period: `?period=custom&from=YYYY-MM-DD&to=YYYY-MM-DD` (both inclusive).
 */
export async function GET(request: Request) {
  return handle<LeaderboardDto | ApiErrorBody>(async () => {
    // Lazy fallback for the cron sweep (spec § 6.10.5): if Vercel Cron didn't
    // fire, run on API access — at most hourly, under the `notify_meta` mutex,
    // in waitUntil so the response isn't delayed.
    ensureNotifySweep();

    const params = new URL(request.url).searchParams;
    const parsed = periodSelectionSchema.safeParse({
      period: params.get('period') ?? undefined,
      from: params.get('from') ?? undefined,
      to: params.get('to') ?? undefined,
    });
    if (!parsed.success) return validationError(parsed.error);

    // Close stale walks before ranking (spec § 7.6): otherwise they stay
    // "active" and are excluded from totals.
    try {
      await closeStaleWalks();
    } catch (error) {
      console.error('[leaderboard] autoclose failed', error);
    }

    return NextResponse.json(await getLeaderboard(parsed.data));
  });
}
