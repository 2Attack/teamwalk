import { NextResponse } from 'next/server';

import { handle, type ApiErrorBody } from '@/lib/api';
import { listActiveTreadmills } from '@/lib/db/queries/walks';
import type { TreadmillDto } from '@/lib/types';
import { closeStaleWalks } from '@/lib/walks/autoclose';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/treadmills — только активные дорожки с текущей занятостью (п. 6.9.6).
 * Автозакрытие вызывается здесь же: занятость читается чаще всего, и
 * освободившаяся дорожка не должна висеть занятой (п. 7.6).
 */
export async function GET() {
  return handle<TreadmillDto[] | ApiErrorBody>(async () => {
    await closeStaleWalks();
    return NextResponse.json(await listActiveTreadmills());
  });
}
