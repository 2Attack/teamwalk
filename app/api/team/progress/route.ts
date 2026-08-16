import { NextResponse } from 'next/server';

import type { ApiErrorBody } from '@/lib/api';
import { handle } from '@/lib/api';
import { getTeamProgress } from '@/lib/game/progress';
import type { TeamProgressDto } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/team/progress — team kilometers projected onto the route. */
export function GET() {
  return handle<TeamProgressDto | ApiErrorBody>(async () => {
    const progress = await getTeamProgress();
    return NextResponse.json(progress);
  });
}
