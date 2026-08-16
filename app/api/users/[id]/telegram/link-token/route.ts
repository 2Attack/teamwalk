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
 * POST /api/users/:id/telegram/link-token — one-time link token:
 * 15-minute TTL plus deep link `https://t.me/<bot>?start=<token>`.
 */
export function POST(_request: Request, context: RouteContext) {
  return handle<TelegramLinkTokenDto | ApiErrorBody>(async () => {
    const id = uuidSchema.parse((await context.params).id);

    // No bot token or kill switch off — the whole subsystem is disabled.
    if (!telegramEnabled()) {
      return apiError(409, 'TELEGRAM_DISABLED', m.apiMessages.telegramNotConfigured);
    }

    // No token for a nonexistent member — the insert would fail on the FK with 500.
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
