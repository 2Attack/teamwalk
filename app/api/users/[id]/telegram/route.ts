import { NextResponse } from 'next/server';

import type { ApiErrorBody } from '@/lib/api';
import { apiError, handle } from '@/lib/api';
import { getTelegramStatus, unlink } from '@/lib/telegram/links';
import type { TelegramStatusDto } from '@/lib/types';
import { uuidSchema } from '@/lib/validation';
import { m } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/users/:id/telegram — link status for the card and panel (spec § 6.10.2). */
export function GET(_request: Request, context: RouteContext) {
  return handle<TelegramStatusDto | ApiErrorBody>(async () => {
    const id = uuidSchema.parse((await context.params).id);
    const status = await getTelegramStatus(id);
    if (!status) return apiError(404, 'NOT_FOUND', m.apiMessages.userNotFound);
    return NextResponse.json(status);
  });
}

/** DELETE /api/users/:id/telegram — unlink, equivalent to the bot's `/stop` (spec § 6.10.7). */
export function DELETE(_request: Request, context: RouteContext) {
  return handle<TelegramStatusDto | ApiErrorBody>(async () => {
    const id = uuidSchema.parse((await context.params).id);

    // Unlink is idempotent: a repeat DELETE without a link is the same state, not an error.
    await unlink(id);

    const status = await getTelegramStatus(id);
    if (!status) return apiError(404, 'NOT_FOUND', m.apiMessages.userNotFound);
    return NextResponse.json(status);
  });
}
