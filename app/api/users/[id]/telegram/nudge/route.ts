import { NextResponse } from 'next/server';

import type { ApiErrorBody } from '@/lib/api';
import { apiError, handle, readJson } from '@/lib/api';
import { getTelegramStatus, recordNudge } from '@/lib/telegram/links';
import type { TelegramStatusDto } from '@/lib/types';
import { telegramNudgeSchema, uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/users/:id/telegram/nudge — фиксация показа («shown») или отказа
 * («dismissed») панели-приглашения (п. 6.10.2). Счётчики живут в БД на участнике,
 * а не в localStorage: «не предлагать» действует с телефона и с ноутбука сразу.
 */
export function POST(request: Request, context: RouteContext) {
  return handle<TelegramStatusDto | ApiErrorBody>(async () => {
    const id = uuidSchema.parse((await context.params).id);
    const { action } = telegramNudgeSchema.parse(await readJson(request));

    await recordNudge(id, action);

    // Свежий статус — клиент сразу узнаёт, можно ли показывать панель дальше.
    const status = await getTelegramStatus(id);
    if (!status) return apiError(404, 'NOT_FOUND', 'Участник не найден');
    return NextResponse.json(status);
  });
}
