import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import type { ApiErrorBody } from '@/lib/api';
import { apiError, handle } from '@/lib/api';
import { DELETE_WINDOW_MINUTES } from '@/lib/config';
import { db } from '@/lib/db';
import { getUser } from '@/lib/db/queries/users';
import { treadmills, walks } from '@/lib/db/schema';
import type { WalkDto, WalkStatus } from '@/lib/types';
import { uuidSchema } from '@/lib/validation';
import { fmt, m } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const limitSchema = z.coerce
  .number({ message: m.apiMessages.limitInteger })
  .int({ message: m.apiMessages.limitInteger })
  .min(1, { message: fmt(m.apiMessages.limitRange, { max: MAX_LIMIT }) })
  .max(MAX_LIMIT, { message: fmt(m.apiMessages.limitRange, { max: MAX_LIMIT }) })
  .default(DEFAULT_LIMIT);

const deleteWindowMs = DELETE_WINDOW_MINUTES * 60 * 1000;

/** The delete window is enforced server-side, not just by hiding the UI button (spec § 7.7). */
function canDelete(status: WalkStatus, endedAt: Date | null, now: number): boolean {
  if (status !== 'finished' || !endedAt) return false;
  return now - endedAt.getTime() <= deleteWindowMs;
}

/** GET /api/users/:id/walks?limit=20 — member's walk history (spec § 5.1). */
export function GET(request: Request, context: RouteContext) {
  return handle<WalkDto[] | ApiErrorBody>(async () => {
    const id = uuidSchema.parse((await context.params).id);
    const rawLimit = new URL(request.url).searchParams.get('limit');
    const limit = limitSchema.parse(rawLimit ?? undefined);

    const user = await getUser(id);
    if (!user) return apiError(404, 'NOT_FOUND', m.apiMessages.userNotFound);

    const rows = await db
      .select({
        id: walks.id,
        userId: walks.userId,
        treadmillId: walks.treadmillId,
        treadmillName: treadmills.name,
        startedAt: walks.startedAt,
        endedAt: walks.endedAt,
        durationSec: walks.durationSec,
        distanceKm: walks.distanceKm,
        speedKmh: walks.speedKmh,
        status: walks.status,
      })
      .from(walks)
      .innerJoin(treadmills, eq(treadmills.id, walks.treadmillId))
      .where(eq(walks.userId, id))
      .orderBy(desc(walks.startedAt))
      .limit(limit);

    const now = Date.now();
    const result: WalkDto[] = rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      treadmillId: row.treadmillId,
      treadmillName: row.treadmillName,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt ? row.endedAt.toISOString() : null,
      durationSec: row.durationSec,
      // numeric(5,2) arrives from the driver as a string — the client needs a number.
      distanceKm: row.distanceKm === null ? null : Number(row.distanceKm),
      speedKmh: row.speedKmh,
      status: row.status,
      canDelete: canDelete(row.status, row.endedAt, now),
    }));

    return NextResponse.json(result);
  });
}
