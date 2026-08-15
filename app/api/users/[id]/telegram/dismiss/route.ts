import { NextResponse } from 'next/server';

import type { ApiErrorBody } from '@/lib/api';
import { apiError, handle } from '@/lib/api';
import { dismissNudge, getTelegramStatus } from '@/lib/telegram/links';
import type { TelegramStatusDto } from '@/lib/types';
import { uuidSchema } from '@/lib/validation';
import { m } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/users/:id/telegram/dismiss — «Больше не показывать» панель-приглашение
 * (п. 6.10.2). Отказ живёт в БД на участнике, а не в localStorage: действует
 * с телефона и с ноутбука сразу; отвязка Telegram сбрасывает его.
 */
export function POST(_request: Request, context: RouteContext) {
  return handle<TelegramStatusDto | ApiErrorBody>(async () => {
    const id = uuidSchema.parse((await context.params).id);

    // Свежий статус до записи — заодно проверка, что участник существует.
    const status = await getTelegramStatus(id);
    if (!status) return apiError(404, 'NOT_FOUND', m.apiMessages.userNotFound);

    await dismissNudge(id);
    return NextResponse.json({ ...status, dismissed: true });
  });
}
