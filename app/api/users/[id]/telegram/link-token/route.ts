import { NextResponse } from 'next/server';

import type { ApiErrorBody } from '@/lib/api';
import { apiError, handle } from '@/lib/api';
import { getBotUsername, telegramEnabled } from '@/lib/telegram/client';
import { createLinkToken, getTelegramStatus } from '@/lib/telegram/links';
import type { TelegramLinkTokenDto } from '@/lib/types';
import { uuidSchema } from '@/lib/validation';
import { m } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/users/:id/telegram/link-token — одноразовая ссылка привязки (п. 6.10.3):
 * токен с TTL 15 минут и deep link `https://t.me/<бот>?start=<токен>`.
 */
export function POST(_request: Request, context: RouteContext) {
  return handle<TelegramLinkTokenDto | ApiErrorBody>(async () => {
    const id = uuidSchema.parse((await context.params).id);

    // Нет токена бота или рубильник опущен — вся подсистема выключена (п. 6.10.7).
    if (!telegramEnabled()) {
      return apiError(409, 'TELEGRAM_DISABLED', m.apiMessages.telegramNotConfigured);
    }

    // Токен не выдаётся несуществующему участнику — иначе вставка упала бы по FK с 500.
    const status = await getTelegramStatus(id);
    if (!status) return apiError(404, 'NOT_FOUND', m.apiMessages.userNotFound);

    const username = await getBotUsername();
    if (!username) {
      return apiError(500, 'INTERNAL_ERROR', m.apiMessages.botNameUnavailable);
    }

    const { token, expiresAt } = await createLinkToken(id);
    return NextResponse.json({
      url: `https://t.me/${username}?start=${token}`,
      expiresAt: expiresAt.toISOString(),
    });
  });
}
