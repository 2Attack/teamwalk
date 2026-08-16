import { NextResponse } from 'next/server';

import { apiError, handle, readJson, validationError, type ApiErrorBody } from '@/lib/api';
import { db } from '@/lib/db';
import { getActiveWalkById, getWalkById } from '@/lib/db/queries/walks';
import { walkSpeedSegments } from '@/lib/db/schema';
import type { ActiveWalkDto } from '@/lib/types';
import { changeSpeedSchema, uuidSchema } from '@/lib/validation';
import { fmt, m } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/walks/:id/speed — change speed mid-walk.
 *
 * Inserts a segment rather than updating the walk: the new speed applies from
 * `now()`, while distance already covered keeps its old speed. Rewriting
 * `walks.speed_kmh` would retroactively recompute the whole distance —
 * slowing down at the end would "lose" kilometers already walked.
 *
 * The server timestamps the change, not the client: the tablet clock may be
 * wrong, and distance is computed from these marks.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idCheck = uuidSchema.safeParse(id);
  if (!idCheck.success) return validationError(idCheck.error);

  const bodyCheck = changeSpeedSchema.safeParse(await readJson(request));
  if (!bodyCheck.success) return validationError(bodyCheck.error);

  const walkId = idCheck.data;
  const { speedKmh } = bodyCheck.data;

  return handle<ActiveWalkDto | ApiErrorBody>(async () => {
    const walk = await getActiveWalkById(walkId);
    if (!walk) {
      // Distinguish "no such walk" from "no longer active": the walk screen reacts differently.
      const known = await getWalkById(walkId);
      if (!known) return apiError(404, 'NOT_FOUND', m.apiMessages.walkNotFound);
      return apiError(409, 'WALK_NOT_ACTIVE', m.apiMessages.walkNotActiveSpeed);
    }

    // The ceiling is per-treadmill; the CHECK constraint doesn't cover it (same as at start).
    if (speedKmh > walk.treadmillMaxSpeedKmh) {
      return apiError(
        400,
        'SPEED_OUT_OF_RANGE',
        fmt(m.apiMessages.speedAboveCeiling, { name: walk.treadmillName, max: walk.treadmillMaxSpeedKmh }),
        { field: 'speedKmh' },
      );
    }

    // Same speed is a no-op: a zero-length segment would only clutter history.
    // A retry after a lost connection lands here too and gets 200.
    if (speedKmh === walk.speedKmh) return NextResponse.json(walk);

    await db.insert(walkSpeedSegments).values({ walkId, speedKmh });

    const updated = await getActiveWalkById(walkId);
    if (!updated) {
      // The walk was closed concurrently: the speed is recorded, but there's nothing to return.
      return apiError(409, 'WALK_NOT_ACTIVE', m.apiMessages.walkJustFinished);
    }

    return NextResponse.json(updated);
  });
}
