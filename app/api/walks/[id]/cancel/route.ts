import { waitUntil } from '@vercel/functions';
import { and, eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { apiError, handle, validationError, type ApiErrorBody } from '@/lib/api';
import { db } from '@/lib/db';
import { getWalkById } from '@/lib/db/queries/walks';
import { walks } from '@/lib/db/schema';
import { notifyTreadmillFreed, wereAllTreadmillsBusy } from '@/lib/telegram/notify';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/walks/:id/cancel — отмена без сохранения результата.
 * Дистанция не проставляется никогда: её не было (п. 7.6).
 * Повтор на уже отменённой прогулке — 200, а не ошибка.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idCheck = uuidSchema.safeParse(id);
  if (!idCheck.success) return validationError(idCheck.error);
  const walkId = idCheck.data;

  return handle<{ ok: boolean } | ApiErrorBody>(async () => {
    // До апдейта: отмена при полностью занятых дорожках — тоже освобождение
    // (п. 6.10.4). При выключенном Telegram вернёт false без запроса к БД.
    const wasFullHouse = await wereAllTreadmillsBusy();

    const cancelled = await db
      .update(walks)
      .set({
        status: 'cancelled',
        endedAt: sql`now()`,
        durationSec: sql`greatest(0, extract(epoch from (now() - ${walks.startedAt}))::int)`,
      })
      .where(and(eq(walks.id, walkId), eq(walks.status, 'active')))
      .returning({ id: walks.id });

    if (cancelled.length === 0) {
      const current = await getWalkById(walkId);
      if (!current) return apiError(404, 'NOT_FOUND', 'Прогулка не найдена');
      // Идемпотентность: повторная отмена — это успех, а не конфликт.
      if (current.status === 'cancelled') return NextResponse.json({ ok: true });
      return apiError(409, 'WALK_NOT_ACTIVE', 'Прогулка уже завершена — отменить её нельзя');
    }

    // Свежая отмена освободила дорожку при аншлаге — событие для ждавших
    // (п. 6.10.4). Чтение нужно только ради имени дорожки и длительности.
    if (wasFullHouse) {
      const walk = await getWalkById(walkId);
      if (walk) {
        waitUntil(
          notifyTreadmillFreed({
            walkId: walk.id,
            treadmillName: walk.treadmillName,
            freedByUserId: walk.userId,
            busySec: walk.durationSec ?? 0,
          }),
        );
      }
    }

    return NextResponse.json({ ok: true });
  });
}
