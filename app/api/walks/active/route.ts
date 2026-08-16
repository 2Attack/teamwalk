import { NextResponse } from 'next/server';

import { handle, validationError, type ApiErrorBody } from '@/lib/api';
import { getActiveWalk } from '@/lib/db/queries/walks';
import type { ActiveWalkDto } from '@/lib/types';
import { uuidSchema } from '@/lib/validation';
import { closeStaleWalks } from '@/lib/walks/autoclose';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/walks/active?userId= — the member's active walk or `null`.
 * `startedAt` is the source of truth for the client timer (spec § 5.2).
 */
export async function GET(request: Request) {
  const parsed = uuidSchema.safeParse(new URL(request.url).searchParams.get('userId') ?? '');
  if (!parsed.success) return validationError(parsed.error);
  const userId = parsed.data;

  return handle<ActiveWalkDto | null | ApiErrorBody>(async () => {
    // Lazy autoclose: a forgotten walk must not show as active (spec § 7.6).
    await closeStaleWalks();

    const walk: ActiveWalkDto | null = await getActiveWalk(userId);
    return NextResponse.json(walk);
  });
}
