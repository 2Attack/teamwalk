import { and, eq, gte, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { apiError, handle, validationError, type ApiErrorBody } from '@/lib/api';
import { DELETE_WINDOW_MINUTES } from '@/lib/config';
import { db } from '@/lib/db';
import { getWalkById } from '@/lib/db/queries/walks';
import { walks } from '@/lib/db/schema';
import { uuidSchema } from '@/lib/validation';
import { fmt, m } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/walks/:id — delete a mistaken entry within the 15-minute window (spec § 7.7).
 * The window is enforced server-side, right in the WHERE: a hidden UI button is not enough.
 * Achievements are not revoked — `achievements.walk_id` nulls via `on delete set null`.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idCheck = uuidSchema.safeParse(id);
  if (!idCheck.success) return validationError(idCheck.error);
  const walkId = idCheck.data;

  return handle<{ ok: boolean } | ApiErrorBody>(async () => {
    // Config constant, not user input.
    const window = sql.raw(`interval '${Number(DELETE_WINDOW_MINUTES)} minutes'`);

    const deleted = await db
      .delete(walks)
      .where(and(eq(walks.id, walkId), gte(walks.endedAt, sql`now() - ${window}`)))
      .returning({ id: walks.id });

    if (deleted.length === 0) {
      const current = await getWalkById(walkId);
      if (!current) return apiError(404, 'NOT_FOUND', m.apiMessages.entryNotFound);
      if (current.status === 'active') {
        return apiError(
          403,
          'DELETE_WINDOW_EXPIRED',
          m.apiMessages.walkStillActive,
        );
      }
      return apiError(
        403,
        'DELETE_WINDOW_EXPIRED',
        fmt(m.apiMessages.deleteWindowExpired, { minutes: DELETE_WINDOW_MINUTES }),
      );
    }

    return NextResponse.json({ ok: true });
  });
}
