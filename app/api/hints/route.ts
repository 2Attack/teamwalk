import { NextResponse } from 'next/server';

import type { ApiErrorBody } from '@/lib/api';
import { handle } from '@/lib/api';
import { ensureFreshPool, getHintsPool } from '@/lib/hints/select';
import type { HintsResponseDto } from '@/lib/types';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/hints?userId= — пул готовых фраз из `hints_cache` (п. 6.6.9 ТЗ).
 *
 * Синхронного обращения к LLM здесь не происходит никогда: пул отдаётся из БД,
 * а регенерация уходит в фон через `waitUntil` уже после формирования ответа.
 */
export function GET(request: Request) {
  return handle<HintsResponseDto | ApiErrorBody>(async () => {
    const raw = new URL(request.url).searchParams.get('userId');
    // Кривой userId — не ошибка, а повод отдать общий пул: лента не тот элемент,
    // ради которого стоит показывать пользователю сообщение об ошибке.
    const parsed = raw ? uuidSchema.safeParse(raw) : null;
    const userId = parsed?.success ? parsed.data : undefined;

    const pool = await getHintsPool(userId);

    // Проверка свежести и генерация — строго после того, как ответ собран.
    ensureFreshPool();

    return NextResponse.json(pool, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  });
}
