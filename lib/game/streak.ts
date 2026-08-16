import { and, eq, inArray, sql } from 'drizzle-orm';

import { STREAK_FREEZES_PER_MONTH, TZ } from '../config';
import { streakFreezes, walks } from '../db/schema';
import { isWeekend, prevWorkday, toOfficeDay } from '../time';
import type { StreakDto } from '../types';

/**
 * Streaks. The streak itself is never stored: denormalization
 * would drift on walk deletion. The only persisted state is used
 * freezes — "how many misses were forgiven this month" cannot be recovered
 * from `walks`.
 */

/**
 * The walk's office day is computed in SQL: day boundaries follow `Europe/Moscow`,
 * or a 23:30 walk would land in the next day. `TZ` is a config
 * constant, not user input, so `sql.raw` is safe.
 */
const officeDayExpr = sql<string>`to_char(${walks.startedAt} AT TIME ZONE ${sql.raw(
  `'${TZ}'`,
)}, 'YYYY-MM-DD')`;

export interface StreakComputation {
  days: number;
  frozen: boolean;
  freezesLeft: number;
  /** Freezes to persist into `streak_freezes` after this computation. */
  freezesToUse: string[];
}

const monthOf = (day: string): string => day.slice(0, 7);

/**
 * Pure computation core — all streak logic lives here so it can be tested
 * without a database. Dates are office `YYYY-MM-DD` strings; string comparison
 * matches chronological order.
 *
 * @param days        days with at least one finished walk (any order)
 * @param today       today's office day
 * @param freezesUsed already-spent freezes (dates of the missed days)
 * @param freezesLimit freeze limit per calendar month
 */
export function computeStreak(
  days: string[],
  today: string,
  freezesUsed: string[],
  freezesLimit: number,
): StreakComputation {
  // Weekend walks don't extend the streak, so they are excluded entirely.
  const walked = new Set(days.filter((day) => !isWeekend(day)));
  const usedSet = new Set(freezesUsed);
  const currentMonth = monthOf(today);

  /** Freezes taken in a month: already persisted plus planned by this computation. */
  const spentIn = (month: string, planned: readonly string[]): number =>
    freezesUsed.filter((day) => monthOf(day) === month).length +
    planned.filter((day) => monthOf(day) === month && !usedSet.has(day)).length;

  /** Freezes that actually hold the current streak together. */
  const committed: string[] = [];
  /** Freezes past the last counted day — unknown yet whether they save anything. */
  let pending: string[] = [];
  let streak = 0;

  const earliest = walked.size > 0 ? [...walked].sort()[0] : null;

  if (earliest !== null) {
    // Today without a walk is not a miss yet: the workday isn't over, spending a
    // freeze on it is premature. Counting starts from the previous workday.
    let cursor = isWeekend(today) || !walked.has(today) ? prevWorkday(today) : today;

    while (cursor >= earliest) {
      if (walked.has(cursor)) {
        streak += 1;
        // Trailing misses are committed only once a day they actually save is
        // found: otherwise a freeze would burn for nothing at the start of history.
        committed.push(...pending);
        pending = [];
      } else {
        const planned = committed.concat(pending);
        // A previously paid-for miss doesn't spend the budget again.
        if (!usedSet.has(cursor) && spentIn(monthOf(cursor), planned) >= freezesLimit) break;
        pending.push(cursor);
      }
      cursor = prevWorkday(cursor);
    }
  }

  return {
    days: streak,
    frozen: committed.length > 0,
    freezesLeft: Math.max(0, freezesLimit - spentIn(currentMonth, committed)),
    freezesToUse: committed.filter((day) => !usedSet.has(day)),
  };
}

/**
 * DB connection is imported lazily: `lib/db` throws without `DATABASE_URL`,
 * and pure `computeStreak` must be importable in unit tests with no env.
 */
async function database() {
  const { db } = await import('../db');
  return db;
}

/** Persist spent freezes: a miss is paid once, not on every computation. */
async function persistFreezes(rows: { userId: string; usedOn: string }[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await database();
  // A race between two concurrent computations is settled by streak_freezes_uniq.
  await db.insert(streakFreezes).values(rows).onConflictDoNothing();
}

export async function getStreak(userId: string, now: Date = new Date()): Promise<StreakDto> {
  const db = await database();
  const today = toOfficeDay(now);

  const [dayRows, freezeRows] = await Promise.all([
    db
      .selectDistinct({ day: officeDayExpr })
      .from(walks)
      .where(and(eq(walks.userId, userId), eq(walks.status, 'finished'))),
    db
      .select({ usedOn: streakFreezes.usedOn })
      .from(streakFreezes)
      .where(eq(streakFreezes.userId, userId)),
  ]);

  const result = computeStreak(
    dayRows.map((row) => row.day),
    today,
    freezeRows.map((row) => row.usedOn),
    STREAK_FREEZES_PER_MONTH,
  );

  await persistFreezes(result.freezesToUse.map((usedOn) => ({ userId, usedOn })));

  return { days: result.days, freezesLeft: result.freezesLeft, frozen: result.frozen };
}

/**
 * Streaks for a list of participants at once. The leaderboard calls this for a
 * hundred people, so exactly two queries — days and freezes — regardless of list size.
 */
export async function getStreakDaysBulk(userIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(userIds)];
  const streaks = new Map<string, number>();
  if (ids.length === 0) return streaks;

  const db = await database();
  const today = toOfficeDay();

  const [dayRows, freezeRows] = await Promise.all([
    db
      .selectDistinct({ userId: walks.userId, day: officeDayExpr })
      .from(walks)
      .where(and(inArray(walks.userId, ids), eq(walks.status, 'finished'))),
    db
      .select({ userId: streakFreezes.userId, usedOn: streakFreezes.usedOn })
      .from(streakFreezes)
      .where(inArray(streakFreezes.userId, ids)),
  ]);

  const daysByUser = new Map<string, string[]>();
  for (const row of dayRows) {
    const list = daysByUser.get(row.userId);
    if (list) list.push(row.day);
    else daysByUser.set(row.userId, [row.day]);
  }

  const freezesByUser = new Map<string, string[]>();
  for (const row of freezeRows) {
    const list = freezesByUser.get(row.userId);
    if (list) list.push(row.usedOn);
    else freezesByUser.set(row.userId, [row.usedOn]);
  }

  const pending: { userId: string; usedOn: string }[] = [];
  for (const id of ids) {
    const result = computeStreak(
      daysByUser.get(id) ?? [],
      today,
      freezesByUser.get(id) ?? [],
      STREAK_FREEZES_PER_MONTH,
    );
    streaks.set(id, result.days);
    for (const usedOn of result.freezesToUse) pending.push({ userId: id, usedOn });
  }

  // One shared insert for everyone: freeze spending must not become N queries.
  await persistFreezes(pending);

  return streaks;
}
