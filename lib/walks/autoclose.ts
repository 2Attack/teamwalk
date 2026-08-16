import { waitUntil } from '@vercel/functions';
import { and, eq, lt, sql } from 'drizzle-orm';

import { STALE_WALK_HOURS } from '@/lib/config';
import { db } from '@/lib/db';
import { treadmills, walks } from '@/lib/db/schema';
import {
  notifyAutoClosed,
  notifyTreadmillFreed,
  wereAllTreadmillsBusy,
} from '@/lib/telegram/notify';
import { uiText } from '@/lib/telegram/texts';

/**
 * Auto-close stale walks (spec § 7.6): someone forgot to press "End walk".
 * Invoked lazily from API handlers — cheaper and more reliable than cron on
 * the Hobby plan. The status change releases the record from the partial
 * unique indexes, unblocking both the participant and the treadmill.
 *
 * `duration_sec` is set (to know how long the treadmill was occupied), but
 * distance never is: it is unknown, and deriving it from 8 hours of speed
 * would credit kilometers nobody walked.
 */
export async function closeStaleWalks(): Promise<number> {
  // Config constant, not user input — safe to inline into the interval literal.
  const staleInterval = sql.raw(`interval '${Number(STALE_WALK_HOURS)} hours'`);

  // Check before closing: auto-close during a full house also frees a
  // treadmill (spec § 6.10.4). Returns false without a DB query when Telegram is off.
  const wasFullHouse = await wereAllTreadmillsBusy();

  const closed = await db
    .update(walks)
    .set({
      status: 'cancelled',
      endedAt: sql`now()`,
      durationSec: sql`greatest(0, extract(epoch from (now() - ${walks.startedAt}))::int)`,
    })
    .where(and(eq(walks.status, 'active'), lt(walks.startedAt, sql`now() - ${staleInterval}`)))
    .returning({
      id: walks.id,
      userId: walks.userId,
      treadmillId: walks.treadmillId,
      durationSec: walks.durationSec,
    });

  if (closed.length > 0) {
    console.warn('[walks] autoclosed stale walks', { count: closed.length });

    // Telegram notification (spec § 6.10.4): otherwise the user learns about the
    // auto-close a week later from the leaderboard. Off the hot path; dedup lives in notify.
    waitUntil(notifyAutoClosed(closed.map((r) => ({ walkId: r.id, userId: r.userId }))));

    // The "all busy → free" transition happens once — attach the event to the
    // first closed walk; the treadmill name is fetched in the background.
    if (wasFullHouse) {
      const first = closed[0];
      waitUntil(
        (async () => {
          const rows = await db
            .select({ name: treadmills.name })
            .from(treadmills)
            .where(eq(treadmills.id, first.treadmillId))
            .limit(1);
          await notifyTreadmillFreed({
            walkId: first.id,
            treadmillName: rows[0]?.name ?? uiText.fallbackTreadmillName,
            freedByUserId: first.userId,
            busySec: first.durationSec ?? 0,
          });
        })().catch((error) => {
          console.error('[telegram] freed-after-autoclose failed', error);
        }),
      );
    }
  }

  return closed.length;
}
