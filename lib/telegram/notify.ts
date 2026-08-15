import { and, desc, eq, inArray, isNull, lt, ne, notExists, or, sql } from 'drizzle-orm';

import { FREE_WINDOW_END_HOUR, FREE_WINDOW_START_HOUR } from '@/lib/config';
import { db } from '@/lib/db';
import { hintsCache, notificationLog, telegramLinks, treadmills, walks } from '@/lib/db/schema';
import type { TelegramLink } from '@/lib/db/schema';
import { avgSpeedKmh } from '@/lib/format';
import { isWeekend, officeHour, toOfficeDay } from '@/lib/time';
import type { ActiveWalkDto, FinishWalkResultDto } from '@/lib/types';

import { sendMessage, telegramEnabled } from './client';
import { getLink } from './links';
import { autocloseText, finishText, freeText, startText, uiText } from './texts';

/**
 * Event notifications: start, finish, autoclose (spec § 6.10.4, 6.10.5).
 *
 * Self-contained background tasks: called from handlers via `waitUntil()`
 * after the client response; they read the link and preferences themselves.
 * Never throw — Telegram being down must not affect any app function
 * (spec § 6.10.1).
 *
 * Idempotency via `notification_log`: dedup-key insert against a unique
 * index; an empty `returning` means another instance already sent.
 */

/** Muted via `/mute`: a future date — stay silent (spec § 6.10.3). */
function isMuted(link: TelegramLink): boolean {
  return link.mutedUntil !== null && link.mutedUntil.getTime() > Date.now();
}

/** true — we inserted the key, safe to send; false — already sent. */
async function tryDedup(userId: string, kind: string, dedupKey: string): Promise<boolean> {
  const rows = await db
    .insert(notificationLog)
    .values({ userId, kind, dedupKey })
    .onConflictDoNothing()
    .returning({ id: notificationLog.id });
  return rows.length > 0;
}

/**
 * Postscript hint for the finish message (spec § 6.10.4): a line from the
 * ready `hints_cache` with two extra sieves — `tone ∈ {praise, neutral, tip}`
 * and the subject is the recipient or nobody. `tease` never goes to DMs: on
 * the shared screen it is a game, one-on-one it is a jab. On any error — no hint.
 */
async function pickHint(userId: string): Promise<string | null> {
  try {
    const rows = await db
      .select({ text: hintsCache.text })
      .from(hintsCache)
      .where(
        and(
          inArray(hintsCache.tone, ['praise', 'neutral', 'tip']),
          or(isNull(hintsCache.subjectId), eq(hintsCache.subjectId, userId)),
        ),
      )
      .orderBy(desc(hintsCache.generatedAt))
      .limit(30);
    if (rows.length === 0) return null;
    return rows[Math.floor(Math.random() * rows.length)].text;
  } catch (error) {
    console.error('[telegram] hint postscript failed', error);
    return null;
  }
}

/** Walk start: silent, with an "It's not me" button — prank protection (spec § 6.10). */
export async function notifyWalkStarted(walk: ActiveWalkDto): Promise<void> {
  try {
    if (!telegramEnabled()) return;

    const link = await getLink(walk.userId);
    if (!link || !link.notifyStart || isMuted(link)) return;
    if (!(await tryDedup(walk.userId, 'start', `start:${walk.id}`))) return;

    await sendMessage(link.chatId, startText({ speedKmh: walk.speedKmh, treadmillName: walk.treadmillName }), {
      silent: true,
      replyMarkup: {
        inline_keyboard: [[{ text: uiText.cancelWalkButton, callback_data: `cancel:${walk.id}` }]],
      },
    });
  } catch (error) {
    console.error('[telegram] notifyWalkStarted failed', error);
  }
}

/** Finish: the product's main message, regular (not silent). */
export async function notifyWalkFinished(result: FinishWalkResultDto): Promise<void> {
  try {
    if (!telegramEnabled()) return;

    const { walk } = result;
    const link = await getLink(walk.userId);
    if (!link || !link.notifyFinish || isMuted(link)) return;
    if (!(await tryDedup(walk.userId, 'finish', `finish:${walk.id}`))) return;

    const distanceKm = walk.distanceKm ?? 0;
    const durationSec = walk.durationSec ?? 0;

    let text = finishText({
      distanceKm,
      durationSec,
      avgSpeedKmh: avgSpeedKmh(distanceKm, durationSec),
      streakDays: result.streak.days,
      rankCurrent: result.rank.current,
      rankPrevious: result.rank.previous,
      achievements: result.newAchievements.map((a) => a.title),
    });

    if (link.attachHints) {
      const hint = await pickHint(walk.userId);
      if (hint !== null) text += `\n\n${uiText.hintPrefix} ${hint}`;
    }

    await sendMessage(link.chatId, text);
  } catch (error) {
    console.error('[telegram] notifyWalkFinished failed', error);
  }
}

/**
 * "Are all treadmills busy?" — call **before** freeing one (finish/cancel/
 * autoclose): after the update the "all busy → free" transition is gone.
 * Error or Telegram off — false: the nudge is not worth an extra hot-path
 * query (spec § 6.10.4).
 */
export async function wereAllTreadmillsBusy(): Promise<boolean> {
  if (!telegramEnabled()) return false;
  try {
    // Two simple queries instead of a correlated exists in the filter: there
    // are only a few treadmills, and clarity beats one saved round-trip.
    const totals = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(treadmills)
      .where(eq(treadmills.isActive, true));
    const total = totals[0]?.total ?? 0;
    if (total === 0) return false;

    const busyRows = await db
      .selectDistinct({ treadmillId: walks.treadmillId })
      .from(walks)
      .innerJoin(treadmills, eq(treadmills.id, walks.treadmillId))
      .where(and(eq(walks.status, 'active'), eq(treadmills.isActive, true)));

    return busyRows.length >= total;
  } catch (error) {
    console.error('[telegram] wereAllTreadmillsBusy failed', error);
    return false;
  }
}

/**
 * "Treadmill freed up" (spec § 6.10.4) — the only broadcast category. The
 * caller must check `wereAllTreadmillsBusy()` before freeing: the event is
 * the "all busy → one free" transition, not every finish.
 *
 * Not sent to the one who freed it or to anyone currently walking. Outside
 * the work window — silence, no rescheduling: the event expires instantly.
 * Dedup key `free:<walkId>` — one per event, not per recipient.
 */
export async function notifyTreadmillFreed(input: {
  walkId: string;
  treadmillName: string;
  freedByUserId: string;
  busySec: number;
}): Promise<void> {
  try {
    if (!telegramEnabled()) return;

    // Wider window than reminders (spec § 6.10.4): send while people are in the office.
    const now = new Date();
    if (isWeekend(toOfficeDay(now))) return;
    const hour = officeHour(now);
    if (hour < FREE_WINDOW_START_HOUR || hour >= FREE_WINDOW_END_HOUR) return;

    if (!(await tryDedup(input.freedByUserId, 'free', `free:${input.walkId}`))) return;

    const recipients = await db
      .select({ chatId: telegramLinks.chatId })
      .from(telegramLinks)
      .where(
        and(
          eq(telegramLinks.notifyFree, true),
          or(isNull(telegramLinks.mutedUntil), lt(telegramLinks.mutedUntil, sql`now()`)),
          ne(telegramLinks.userId, input.freedByUserId),
          // Whoever is walking right now does not need a treadmill.
          notExists(
            db
              .select({ one: sql`1` })
              .from(walks)
              .where(and(eq(walks.status, 'active'), eq(walks.userId, telegramLinks.userId))),
          ),
        ),
      );
    if (recipients.length === 0) return;

    // One text per event: every recipient sees the same phrase — a PA
    // announcement, not a personal message.
    const text = freeText({ treadmillName: input.treadmillName, busySec: input.busySec });
    for (const { chatId } of recipients) {
      await sendMessage(chatId, text);
    }
  } catch (error) {
    console.error('[telegram] notifyTreadmillFreed failed', error);
  }
}

/**
 * Autoclose (spec § 7.6): silent, behind the finish toggle — otherwise the
 * user learns about the lost distance a week later from the leaderboard.
 * A failure for one user does not block notifying the rest.
 */
export async function notifyAutoClosed(
  closed: Array<{ walkId: string; userId: string }>,
): Promise<void> {
  try {
    if (!telegramEnabled() || closed.length === 0) return;

    for (const { walkId, userId } of closed) {
      try {
        const link = await getLink(userId);
        if (!link || !link.notifyFinish || isMuted(link)) continue;
        if (!(await tryDedup(userId, 'autoclose', `autoclose:${walkId}`))) continue;

        await sendMessage(link.chatId, autocloseText(), { silent: true });
      } catch (error) {
        console.error('[telegram] notifyAutoClosed failed for walk', walkId, error);
      }
    }
  } catch (error) {
    console.error('[telegram] notifyAutoClosed failed', error);
  }
}
