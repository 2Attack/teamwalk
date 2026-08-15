import { NextResponse } from 'next/server';

import type { ApiErrorBody } from '@/lib/api';
import { handle } from '@/lib/api';
import { ACHIEVEMENTS, listUserAchievements } from '@/lib/game/achievements';
import type { AchievementDto } from '@/lib/types';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/achievements?userId= — achievement catalog with earned marks (spec § 6.8.6).
 * Without `userId` returns the same catalog with all `earnedAt: null`: the
 * catalog must be viewable before a member is selected.
 */
export function GET(request: Request) {
  return handle<AchievementDto[] | ApiErrorBody>(async () => {
    const raw = new URL(request.url).searchParams.get('userId');
    // Malformed userId is a 400, not silently empty marks.
    const userId = raw ? uuidSchema.parse(raw) : null;

    const earned = userId
      ? new Map((await listUserAchievements(userId)).map((item) => [item.code, item.earnedAt]))
      : new Map<string, string | null>();

    const body: AchievementDto[] = ACHIEVEMENTS.map((item) => ({
      ...item,
      earnedAt: earned.get(item.code) ?? null,
    }));

    return NextResponse.json(body);
  });
}
