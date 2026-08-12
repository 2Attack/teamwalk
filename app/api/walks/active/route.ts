import { NextResponse } from 'next/server';

import { handle, validationError, type ApiErrorBody } from '@/lib/api';
import { getActiveWalk } from '@/lib/db/queries/walks';
import type { ActiveWalkDto } from '@/lib/types';
import { uuidSchema } from '@/lib/validation';
import { closeStaleWalks } from '@/lib/walks/autoclose';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/walks/active?userId= — активная прогулка участника или `null`.
 * `startedAt` — источник истины для таймера на клиенте (п. 5.2).
 */
export async function GET(request: Request) {
  const parsed = uuidSchema.safeParse(new URL(request.url).searchParams.get('userId') ?? '');
  if (!parsed.success) return validationError(parsed.error);
  const userId = parsed.data;

  return handle<ActiveWalkDto | null | ApiErrorBody>(async () => {
    // Ленивое автозакрытие: забытая прогулка не должна показываться активной (п. 7.6).
    await closeStaleWalks();

    const walk: ActiveWalkDto | null = await getActiveWalk(userId);
    return NextResponse.json(walk);
  });
}
