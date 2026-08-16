import { NextResponse } from 'next/server';

import { handle } from '@/lib/api';
import { getTeamStats } from '@/lib/db/queries/leaderboard';
import { listActiveWalks } from '@/lib/db/queries/walks';
import type { StatsDto } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/stats` — overall team statistics.
 * Multiple walks may be active — one per treadmill — hence a list.
 */
export async function GET() {
  return handle(async () => {
    const [team, activeWalks] = await Promise.all([getTeamStats(), listActiveWalks()]);

    const body: StatsDto = {
      teamTotalKm: team.teamTotalKm,
      walksCount: team.walksCount,
      usersCount: team.usersCount,
      activeWalks,
    };

    return NextResponse.json(body);
  });
}
