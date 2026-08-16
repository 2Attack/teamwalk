import { waitUntil } from '@vercel/functions';
import { NextResponse } from 'next/server';

import {
  apiError,
  handle,
  isUniqueViolation,
  readJson,
  validationError,
  type ApiErrorBody,
} from '@/lib/api';
import { db } from '@/lib/db';
import { getActiveWalk, getTreadmillById, listActiveTreadmills } from '@/lib/db/queries/walks';
import { walks } from '@/lib/db/schema';
import { formatTimeOfDay } from '@/lib/format';
import { notifyWalkStarted } from '@/lib/telegram/notify';
import { ensureNotifySweep } from '@/lib/telegram/sweep';
import type { ActiveWalkDto, TreadmillDto } from '@/lib/types';
import { startWalkSchema } from '@/lib/validation';
import { closeStaleWalks } from '@/lib/walks/autoclose';
import { fmt, m } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** How many times to re-pick a free treadmill after losing the race for one. */
const MAX_START_ATTEMPTS = 5;

type Chosen =
  | { ok: true; treadmill: TreadmillDto }
  | { ok: false; response: ReturnType<typeof apiError> };

/** Explicitly chosen treadmill: distinguish "no such" from "decommissioned" (spec § 6.9.6). */
async function resolveExplicit(id: string, active: TreadmillDto[]): Promise<Chosen> {
  const found = active.find((t) => t.id === id);
  if (found) return { ok: true, treadmill: found };

  const known = await getTreadmillById(id);
  if (!known) return { ok: false, response: apiError(404, 'NOT_FOUND', m.apiMessages.treadmillNotFound) };

  return {
    ok: false,
    response: apiError(
      409,
      'TREADMILL_INACTIVE',
      fmt(m.apiMessages.treadmillUnavailable, { name: known.name }),
      { field: 'treadmillId' },
    ),
  };
}

/** No treadmill given: a single active one is auto-picked, otherwise the first free one (spec § 6.9). */
function resolveAuto(active: TreadmillDto[], skip: ReadonlySet<string> = new Set()): Chosen {
  if (active.length === 0) {
    return {
      ok: false,
      response: apiError(409, 'NO_TREADMILLS', m.apiMessages.noTreadmills),
    };
  }

  // The list is already sorted by sort_order, name.
  const free = active.find((t) => !t.busy && !skip.has(t.id));
  if (free) return { ok: true, treadmill: free };

  return {
    ok: false,
    response: apiError(409, 'TREADMILL_BUSY', m.apiMessages.allTreadmillsBusy, {
      details: active.map((t) => ({ treadmillId: t.id, name: t.name, busy: t.busy })),
    }),
  };
}

/**
 * Drizzle 0.45 wraps the driver error in `DrizzleQueryError`, which has no
 * `code` — `23505` and the index name live in `cause`. Unwrap the chain, or a
 * race would surface to the client as 500 instead of a clear 409.
 */
function violates(error: unknown, index?: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (isUniqueViolation(current, index)) return true;
    if (!(current instanceof Error) || current.cause === undefined) return false;
    current = current.cause;
  }
  return false;
}

/** 409 per spec § 7.1: the member already has an active walk — returned in `details`. */
async function alreadyActive(userId: string) {
  return apiError(409, 'WALK_ALREADY_ACTIVE', m.apiMessages.walkAlreadyActive, {
    details: await getActiveWalk(userId),
  });
}

/** 409 per spec § 7.2: someone else took the treadmill — return their name and start time. */
async function treadmillBusy(treadmill: TreadmillDto) {
  const busy = (await listActiveTreadmills()).find((t) => t.id === treadmill.id)?.busy ?? null;
  const message = busy
    ? fmt(m.apiMessages.treadmillBusyBy, { name: treadmill.name, user: busy.user.name, time: formatTimeOfDay(busy.startedAt) })
    : fmt(m.apiMessages.treadmillJustTaken, { name: treadmill.name });

  return apiError(409, 'TREADMILL_BUSY', message, { field: 'treadmillId', details: busy });
}

/**
 * POST /api/walks/start — creates an active walk.
 * Concurrency limits are enforced by the DB (partial unique indexes,
 * spec § 7.1–7.2), not by pre-SELECTs: checking "is it free" before insert is a race.
 */
export async function POST(request: Request) {
  const parsed = startWalkSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const { userId, speedKmh, treadmillId } = parsed.data;

  return handle<ActiveWalkDto | ApiErrorBody>(async () => {
    // Lazy cron-sweep fallback (spec § 6.10.5), second hook after the
    // leaderboard: walks start even on days no one opens the ranking.
    ensureNotifySweep();

    // Stale walks free up treadmills before selection (spec § 7.6).
    await closeStaleWalks();

    // The member's own walk is § 7.1, not § 7.2: with a single treadmill it
    // occupies that treadmill too, and without this check they'd get
    // TREADMILL_BUSY instead of WALK_ALREADY_ACTIVE, so the UI wouldn't route
    // them to their walk screen. The partial unique index, not this SELECT,
    // still guards against the race.
    const own = await getActiveWalk(userId);
    if (own) {
      return apiError(409, 'WALK_ALREADY_ACTIVE', m.apiMessages.walkAlreadyActive, { details: own });
    }

    /*
      Retry-based selection: with auto-pick, two members hitting Start at once
      read the same list and both target the first free treadmill. The race
      loser should not get "busy" — parallel walks are normal with two
      treadmills (spec § 7.2) — so they re-pick the next free one. An explicitly
      chosen treadmill is never retried: it must not be silently substituted.
    */
    const failed = new Set<string>();

    for (let attempt = 0; attempt < MAX_START_ATTEMPTS; attempt += 1) {
      const active = await listActiveTreadmills();
      const chosen = treadmillId
        ? await resolveExplicit(treadmillId, active)
        : resolveAuto(active, failed);
      if (!chosen.ok) return chosen.response;

      const treadmill = chosen.treadmill;

      // The speed ceiling is per-treadmill; the CHECK constraint doesn't cover it.
      if (speedKmh > treadmill.maxSpeedKmh) {
        return apiError(
          400,
          'SPEED_OUT_OF_RANGE',
          fmt(m.apiMessages.speedAboveCeiling, { name: treadmill.name, max: treadmill.maxSpeedKmh }),
          { field: 'speedKmh' },
        );
      }

      try {
        await db.insert(walks).values({ userId, treadmillId: treadmill.id, speedKmh });
        break;
      } catch (error) {
        if (violates(error, 'walks_one_active_per_user')) return alreadyActive(userId);

        const busyTreadmill =
          violates(error, 'walks_one_active_per_treadmill') ||
          // 23505 with no recognized index: since the user has no walk, the treadmill is busy.
          (violates(error) && !(await getActiveWalk(userId)));

        if (!busyTreadmill) {
          if (violates(error)) return alreadyActive(userId);
          throw error;
        }

        failed.add(treadmill.id);
        if (treadmillId || attempt === MAX_START_ATTEMPTS - 1) return treadmillBusy(treadmill);
      }
    }

    const walk = await getActiveWalk(userId);
    if (!walk) {
      return apiError(500, 'INTERNAL_ERROR', m.apiMessages.walkCreatedUnreadable);
    }

    // Telegram is never in the hot path (spec § 6.10.1): the start notification
    // goes after the response; idempotency and "not me" live inside notify.
    waitUntil(notifyWalkStarted(walk));

    return NextResponse.json(walk, { status: 201 });
  });
}
