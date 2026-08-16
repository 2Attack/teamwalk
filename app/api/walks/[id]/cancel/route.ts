import { waitUntil } from '@vercel/functions';
import { and, eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { apiError, handle, validationError, type ApiErrorBody } from '@/lib/api';
import { db } from '@/lib/db';
import { getWalkById } from '@/lib/db/queries/walks';
import { walks } from '@/lib/db/schema';
import { notifyTreadmillFreed, wereAllTreadmillsBusy } from '@/lib/telegram/notify';
import { uuidSchema } from '@/lib/validation';
import { m } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/walks/:id/cancel — cancel without saving a result.
 * Distance is never set: there was none.
 * A repeat on an already-cancelled walk is 200, not an error.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idCheck = uuidSchema.safeParse(id);
  if (!idCheck.success) return validationError(idCheck.error);
  const walkId = idCheck.data;

  return handle<{ ok: boolean } | ApiErrorBody>(async () => {
    // Before the update: cancelling while all treadmills are busy also frees
    // one. With Telegram disabled returns false without a DB query.
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
      if (!current) return apiError(404, 'NOT_FOUND', m.apiMessages.walkNotFound);
      // Idempotency: a repeat cancel is success, not a conflict.
      if (current.status === 'cancelled') return NextResponse.json({ ok: true });
      return apiError(409, 'WALK_NOT_ACTIVE', m.apiMessages.walkAlreadyFinished);
    }

    // A fresh cancel freed a treadmill during a full house — notify those
    // waiting. The read is only for the treadmill name and duration.
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
