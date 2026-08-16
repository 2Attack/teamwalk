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
 * POST /api/users/:id/telegram/dismiss — "don't show again" for the invite
 * panel (spec § 6.10.2). Stored on the member in the DB, not localStorage, so
 * it applies across devices; unlinking Telegram resets it.
 */
export function POST(_request: Request, context: RouteContext) {
  return handle<TelegramStatusDto | ApiErrorBody>(async () => {
    const id = uuidSchema.parse((await context.params).id);

    // Fresh status before writing — also verifies the member exists.
    const status = await getTelegramStatus(id);
    if (!status) return apiError(404, 'NOT_FOUND', m.apiMessages.userNotFound);

    await dismissNudge(id);
    return NextResponse.json({ ...status, dismissed: true });
  });
}
