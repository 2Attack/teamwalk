import { NextResponse } from 'next/server';

import type { ApiErrorBody } from '@/lib/api';
import { handle } from '@/lib/api';
import { ACHIEVEMENTS, listUserAchievements } from '@/lib/game/achievements';
import type { AchievementDto } from '@/lib/types';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/achievements?userId= — каталог достижений с отметкой полученных (п. 6.8.6).
 * Без `userId` отдаётся тот же каталог со всеми `earnedAt: null`: витрина условий
 * должна открываться и до выбора участника.
 */
export function GET(request: Request) {
  return handle<AchievementDto[] | ApiErrorBody>(async () => {
    const raw = new URL(request.url).searchParams.get('userId');
    // Кривой userId — это 400, а не молча пустые отметки.
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
