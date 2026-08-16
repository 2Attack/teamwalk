import { waitUntil } from '@vercel/functions';
import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';

import { NOTIFY_WINDOW_END_HOUR, NOTIFY_WINDOW_START_HOUR, TELEGRAM_ENABLED } from '@/lib/config';
import { db } from '@/lib/db';
import { notificationLog, notifyMeta, telegramLinks, users, walks } from '@/lib/db/schema';
import { getLeaderboard } from '@/lib/db/queries/leaderboard';
import { getStreak } from '@/lib/game/streak';
import { getTeamProgress } from '@/lib/game/progress';
import { addOfficeDays, isWeekend, officeHour, officeWeekday, toOfficeDay, workdaysSince } from '@/lib/time';

import { sendMessage } from './client';
import { reminderDecision, type ReminderFacts } from './remind-rules';
import { digestText, remindText } from './texts';

/**
 * Reminders and the weekly digest (spec § 6.10.5).
 *
 * Main entry — Vercel Cron (`GET /api/cron/notify`); lazy fallback —
 * `ensureNotifySweep()` on API access, modeled on `closeStaleWalks()`.
 * Log-based dedup guarantees cron and fallback never send twice.
 */

/** "Not muted via /mute": `muted_until` is empty or in the past. */
const notMuted = or(isNull(telegramLinks.mutedUntil), lt(telegramLinks.mutedUntil, sql`now()`));

/** true — we inserted the key; false — another instance already sent. */
async function tryDedup(userId: string, kind: string, dedupKey: string): Promise<boolean> {
  const rows = await db
    .insert(notificationLog)
    .values({ userId, kind, dedupKey })
    .onConflictDoNothing()
    .returning({ id: notificationLog.id });
  return rows.length > 0;
}

/** The driver returns timestamptz as a Postgres string — request ISO right away. */
const lastWalkAtExpr = sql<
  string | null
>`to_char(max(${walks.startedAt}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/**
 * "Time to stretch" reminders. With ≤100 participants the facts come from
 * three bulk queries: links with users, last walks, sent-reminder log.
 */
async function sendReminders(now: Date, today: string): Promise<void> {
  const links = await db
    .select({
      userId: telegramLinks.userId,
      chatId: telegramLinks.chatId,
      linkedAt: telegramLinks.linkedAt,
      userCreatedAt: users.createdAt,
    })
    .from(telegramLinks)
    .innerJoin(users, eq(users.id, telegramLinks.userId))
    .where(and(eq(telegramLinks.notifyRemind, true), notMuted));
  if (links.length === 0) return;

  const ids = links.map((l) => l.userId);

  const [walkRows, remindRows] = await Promise.all([
    db
      .select({ userId: walks.userId, lastAt: lastWalkAtExpr })
      .from(walks)
      .where(and(inArray(walks.userId, ids), eq(walks.status, 'finished')))
      .groupBy(walks.userId),
    db
      .select({ userId: notificationLog.userId, sentAt: notificationLog.sentAt })
      .from(notificationLog)
      .where(and(inArray(notificationLog.userId, ids), eq(notificationLog.kind, 'remind'))),
  ]);

  const lastWalkByUser = new Map<string, Date>();
  for (const row of walkRows) {
    if (row.lastAt !== null) lastWalkByUser.set(row.userId, new Date(row.lastAt));
  }

  const remindsByUser = new Map<string, Date[]>();
  for (const row of remindRows) {
    const list = remindsByUser.get(row.userId);
    if (list) list.push(row.sentAt);
    else remindsByUser.set(row.userId, [row.sentAt]);
  }

  for (const link of links) {
    try {
      const lastWalkAt = lastWalkByUser.get(link.userId) ?? null;
      // Backoff baseline: last walk finish, or the linking time.
      const baselineAt = lastWalkAt ?? link.linkedAt;
      const reminds = remindsByUser.get(link.userId) ?? [];
      const sinceWalk = reminds.filter((sentAt) => sentAt.getTime() > baselineAt.getTime());
      const lastRemindAt = reminds.reduce<Date | null>(
        (max, cur) => (max === null || cur.getTime() > max.getTime() ? cur : max),
        null,
      );

      const facts: ReminderFacts = {
        today,
        userCreatedDay: toOfficeDay(link.userCreatedAt),
        lastWalkDay: lastWalkAt !== null ? toOfficeDay(lastWalkAt) : null,
        linkedDay: toOfficeDay(link.linkedAt),
        lastRemindDay: lastRemindAt !== null ? toOfficeDay(lastRemindAt) : null,
        remindsSinceWalk: sinceWalk.length,
      };
      if (!reminderDecision(facts)) continue;
      if (!(await tryDedup(link.userId, 'remind', `remind:${link.userId}:${today}`))) continue;

      // Fully missed workdays — same formula as in reminderDecision.
      const baselineDay = facts.lastWalkDay ?? facts.linkedDay;
      const idleWorkdays = workdaysSince(baselineDay, today) - (isWeekend(today) ? 0 : 1);

      const streak = await getStreak(link.userId, now);
      await sendMessage(
        link.chatId,
        remindText({ idleWorkdays, streakDays: streak.days, freezesLeft: streak.freezesLeft }),
      );
    } catch (error) {
      console.error('[telegram] reminder failed for user', link.userId, error);
    }
  }
}

/** Weekly digest: Mondays only, silent (spec § 6.10.4). */
async function sendDigest(today: string): Promise<void> {
  // Previous week: from Monday −7 through Sunday inclusive.
  const from = addOfficeDays(today, -7);
  const to = addOfficeDays(today, -1);

  const [board, progress, links] = await Promise.all([
    getLeaderboard({ period: 'custom', from, to }),
    getTeamProgress(),
    db
      .select()
      .from(telegramLinks)
      .where(and(eq(telegramLinks.notifyDigest, true), notMuted)),
  ]);
  if (links.length === 0) return;

  const weekKm = Math.round(board.rows.reduce((sum, row) => sum + row.totalKm, 0) * 100) / 100;
  const top = board.rows
    .filter((row) => row.totalKm > 0)
    .slice(0, 3)
    .map((row) => ({ name: row.user.name, km: row.totalKm }));

  for (const link of links) {
    try {
      if (!(await tryDedup(link.userId, 'digest', `digest:${link.userId}:${from}`))) continue;

      // No rank without kilometers: a tie at zero is not a position.
      const self = board.rows.find((row) => row.user.id === link.userId);
      const selfRank = self !== undefined && self.totalKm > 0 ? self.rank : null;

      await sendMessage(
        link.chatId,
        digestText({
          weekKm,
          passedCity: progress.passed?.city ?? null,
          top,
          selfRank,
          selfKm: self?.totalKm ?? 0,
        }),
        { silent: true },
      );
    } catch (error) {
      console.error('[telegram] digest failed for user', link.userId, error);
    }
  }
}

/**
 * One sweep pass. Window (spec § 6.10.4): workday, [11:00; 17:00) MSK — a
 * fallback firing at 19:00 sends nothing and defers to tomorrow.
 */
export async function runNotifySweep(now: Date = new Date()): Promise<void> {
  if (!TELEGRAM_ENABLED) return;

  const today = toOfficeDay(now);
  if (isWeekend(today)) return;
  const hour = officeHour(now);
  if (hour < NOTIFY_WINDOW_START_HOUR || hour >= NOTIFY_WINDOW_END_HOUR) return;

  await sendReminders(now, today);
  // 1 = Monday in getUTCDay numbering.
  if (officeWeekday(today) === 1) await sendDigest(today);
}

/**
 * Single-query lock, same mechanics as `hints_meta` (spec § 6.6.5): advisory
 * locks do not survive the stateless Neon HTTP driver. The one-hour interval
 * caps fallback frequency; an empty result — a sweep ran recently.
 */
async function acquireLock(): Promise<boolean> {
  await db.insert(notifyMeta).values({ id: true }).onConflictDoNothing();
  const locked = await db
    .update(notifyMeta)
    .set({ lockedUntil: sql`now() + interval '1 hour'` })
    .where(lt(notifyMeta.lockedUntil, sql`now()`))
    .returning({ id: notifyMeta.id });
  return locked.length > 0;
}

async function sweepIfDue(now: Date): Promise<void> {
  // Fast window check without a single DB query: outside the window the fallback is free.
  if (!TELEGRAM_ENABLED) return;
  if (isWeekend(toOfficeDay(now))) return;
  const hour = officeHour(now);
  if (hour < NOTIFY_WINDOW_START_HOUR || hour >= NOTIFY_WINDOW_END_HOUR) return;

  if (!(await acquireLock())) return;
  await runNotifySweep(now);
}

/**
 * Lazy fallback for a missed cron, modeled on `ensureFreshPool`: returns
 * immediately, the work outlives the response in `waitUntil`. Errors are
 * swallowed — notifications are not worth a 500.
 */
export function ensureNotifySweep(): void {
  waitUntil(
    sweepIfDue(new Date()).catch((error) => {
      console.error('[telegram] background notify sweep failed', error);
    }),
  );
}
