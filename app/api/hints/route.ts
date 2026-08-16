import { NextResponse } from 'next/server';

import type { ApiErrorBody } from '@/lib/api';
import { handle } from '@/lib/api';
import { ensureFreshPool, getHintsPool } from '@/lib/hints/select';
import type { HintsResponseDto } from '@/lib/types';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/hints?userId= — pool of ready phrases from `hints_cache`.
 * Never calls the LLM synchronously: the pool comes from the DB, regeneration
 * goes to the background via `waitUntil` after the response is built.
 */
export function GET(request: Request) {
  return handle<HintsResponseDto | ApiErrorBody>(async () => {
    const raw = new URL(request.url).searchParams.get('userId');
    // Malformed userId falls back to the generic pool: the hint feed is not
    // worth surfacing an error for.
    const parsed = raw ? uuidSchema.safeParse(raw) : null;
    const userId = parsed?.success ? parsed.data : undefined;

    const pool = await getHintsPool(userId);

    // Freshness check and generation strictly after the response is assembled.
    ensureFreshPool();

    return NextResponse.json(pool, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  });
}
