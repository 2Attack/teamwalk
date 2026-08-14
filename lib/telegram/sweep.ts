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
 * Напоминания и недельный дайджест (п. 6.10.5 ТЗ).
 *
 * Основной вход — Vercel Cron (`GET /api/cron/notify`), ленивый фолбэк —
 * `ensureNotifySweep()` при обращениях к API по образцу `closeStaleWalks()`.
 * Дедупликация по журналу гарантирует, что cron и фолбэк не отправят дважды.
 */

/** Условие «не заглушено /mute»: `muted_until` пуст или в прошлом. */
const notMuted = or(isNull(telegramLinks.mutedUntil), lt(telegramLinks.mutedUntil, sql`now()`));

/** true — ключ вставлен нами; false — другой инстанс уже отправил. */
async function tryDedup(userId: string, kind: string, dedupKey: string): Promise<boolean> {
  const rows = await db
    .insert(notificationLog)
    .values({ userId, kind, dedupKey })
    .onConflictDoNothing()
    .returning({ id: notificationLog.id });
  return rows.length > 0;
}

/** Драйвер отдаёт timestamptz строкой Postgres — просим сразу ISO. */
const lastWalkAtExpr = sql<
  string | null
>`to_char(max(${walks.startedAt}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/**
 * Напоминания «пора размяться». Участников ≤100, поэтому факты собираются
 * тремя групповыми запросами: привязки с участниками, последние прогулки,
 * журнал отправленных напоминаний.
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
      // База отсчёта затухания: финиш последней прогулки либо привязка.
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

      // Полностью пропущенные рабочие дни — та же формула, что в reminderDecision.
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

/** Недельный дайджест: только по понедельникам, тихое (п. 6.10.4). */
async function sendDigest(today: string): Promise<void> {
  // Прошлая неделя: от понедельника −7 до воскресенья включительно.
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

      // Место без километров не показываем: ничья по нулям — не позиция.
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
 * Один проход рассылки. Окно (п. 6.10.4): рабочий день, [11:00; 17:00) МСК —
 * фолбэк, сработавший в 19:00, ничего не отправит, а перенесёт на завтра.
 */
export async function runNotifySweep(now: Date = new Date()): Promise<void> {
  if (!TELEGRAM_ENABLED) return;

  const today = toOfficeDay(now);
  if (isWeekend(today)) return;
  const hour = officeHour(now);
  if (hour < NOTIFY_WINDOW_START_HOUR || hour >= NOTIFY_WINDOW_END_HOUR) return;

  await sendReminders(now, today);
  // 1 = понедельник в нумерации getUTCDay.
  if (officeWeekday(today) === 1) await sendDigest(today);
}

/**
 * Лок одним запросом — точная копия механики `hints_meta` (п. 6.6.5):
 * advisory-локи не живут в стейтлесс HTTP-драйвере Neon. Интервал в час
 * ограничивает частоту фолбэка; пустой результат — обход уже шёл недавно.
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
  // Быстрая проверка окна без единого запроса к БД: вне окна фолбэк бесплатен.
  if (!TELEGRAM_ENABLED) return;
  if (isWeekend(toOfficeDay(now))) return;
  const hour = officeHour(now);
  if (hour < NOTIFY_WINDOW_START_HOUR || hour >= NOTIFY_WINDOW_END_HOUR) return;

  if (!(await acquireLock())) return;
  await runNotifySweep(now);
}

/**
 * Ленивый фолбэк на случай несработавшего cron — по образцу `ensureFreshPool`:
 * управление возвращается немедленно, работа доживает в `waitUntil` после
 * ответа пользователю. Любая ошибка гасится — рассылка не стоит 500-й.
 */
export function ensureNotifySweep(): void {
  waitUntil(
    sweepIfDue(new Date()).catch((error) => {
      console.error('[telegram] background notify sweep failed', error);
    }),
  );
}
