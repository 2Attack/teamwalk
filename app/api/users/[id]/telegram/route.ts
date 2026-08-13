import { NextResponse } from 'next/server';

import type { ApiErrorBody } from '@/lib/api';
import { apiError, handle } from '@/lib/api';
import { getTelegramStatus, unlink } from '@/lib/telegram/links';
import type { TelegramStatusDto } from '@/lib/types';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/users/:id/telegram — статус привязки для карточки и панели (п. 6.10.2). */
export function GET(_request: Request, context: RouteContext) {
  return handle<TelegramStatusDto | ApiErrorBody>(async () => {
    const id = uuidSchema.parse((await context.params).id);
    const status = await getTelegramStatus(id);
    if (!status) return apiError(404, 'NOT_FOUND', 'Участник не найден');
    return NextResponse.json(status);
  });
}

/** DELETE /api/users/:id/telegram — отвязка, эквивалент `/stop` из бота (п. 6.10.7). */
export function DELETE(_request: Request, context: RouteContext) {
  return handle<TelegramStatusDto | ApiErrorBody>(async () => {
    const id = uuidSchema.parse((await context.params).id);

    // Отвязка идемпотентна: повторный DELETE без привязки — не ошибка, а то же состояние.
    await unlink(id);

    const status = await getTelegramStatus(id);
    if (!status) return apiError(404, 'NOT_FOUND', 'Участник не найден');
    return NextResponse.json(status);
  });
}
