import { and, eq, isNull, sql } from 'drizzle-orm';

import { TZ } from '../config';
import { db } from '../db';
import { m } from '../i18n';
import { achievements, treadmills, walkSpeedSegments, walks } from '../db/schema';
import { addOfficeDays, officeDayStart, officeWeekday, toOfficeDay } from '../time';
import type { AchievementDto } from '../types';

import { getStreak } from './streak';

/**
 * Achievements (spec § 6.8.3) reward character, not volume: mileage-based ones
 * would always go to the leader, so almost all conditions are reachable by anyone.
 *
 * Achievements are deliberately never revoked (spec § 7.7): taking back an
 * already-shown badge on walk deletion is the worst possible behavior.
 */

/** Award order is the display order; titles come from the i18n dictionary. */
const ACHIEVEMENT_CODES = [
  'first_walk',
  'early_bird',
  'night_owl',
  'lunch_walker',
  'friday_closer',
  'marathon',
  'zen',
  'long_haul',
  'gearbox',
  'cruise',
  'five_days',
  'ten_day_streak',
  'ten_walks',
  'fifty_walks',
  'stayer',
  'full_throttle',
  'fifty_km',
  'first_hundred',
  'warm_treadmill',
  'connected',
] as const;

export const ACHIEVEMENTS: ReadonlyArray<{ code: string; title: string; description: string }> =
  ACHIEVEMENT_CODES.map((code) => ({ code, ...m.achievements[code] }));

/** Condition thresholds. Semantic, not tunable — hence they live next to the catalog. */
const EARLY_BIRD_BEFORE_HOUR = 9;
const NIGHT_OWL_FROM_HOUR = 18;
const LUNCH_FROM_HOUR = 12;
const LUNCH_TO_HOUR = 14;
const FRIDAY_WEEKDAY = 5;
const FRIDAY_FROM_HOUR = 17;
const MARATHON_MIN_SEC = 3600;
const ZEN_MIN_SEC = 1800;
const ZEN_MAX_SPEED_KMH = 2;
const LONG_HAUL_KM = 5;
const GEARBOX_CHANGES = 3;
const CRUISE_WALKS = 10;
const FIVE_DAYS_STREAK = 5;
const TEN_DAY_STREAK = 10;
const TEN_WALKS = 10;
const FIFTY_WALKS = 50;
const STAYER_SPEED_KMH = 7;
const STAYER_WALKS = 10;
const FULL_THROTTLE_MIN_SEC = 600;
const FIFTY_KM = 50;
const FIRST_HUNDRED_KM = 100;
const SAME_DAY_WALKS = 2;

const CATALOG = new Map(ACHIEVEMENTS.map((item) => [item.code, item]));

/**
 * Walk start hour in the office timezone: "before 9:00" means Moscow 9:00,
 * not UTC (spec § 6.8.5).
 */
const hourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  hourCycle: 'h23',
});

const officeHour = (date: Date): number => Number(hourFormatter.format(date));

const toDto = (code: string, earnedAt: Date | null): AchievementDto | null => {
  const item = CATALOG.get(code);
  // A code missing from the catalog (leftover of a removed mechanic) is skipped, not fatal.
  if (!item) return null;
  return { ...item, earnedAt: earnedAt ? earnedAt.toISOString() : null };
};

/**
 * Awarding on walk finish. Called from `POST /api/walks/:id/finish`; returns
 * only genuinely new achievements — the success screen shows them.
 */
export async function awardAchievements(userId: string, walkId: string): Promise<AchievementDto[]> {
  const [walk] = await db.select().from(walks).where(eq(walks.id, walkId)).limit(1);
  // Only your own finished walk counts: auto-closed and cancelled ones do not.
  if (!walk || walk.userId !== userId || walk.status !== 'finished') return [];

  const day = toOfficeDay(walk.startedAt);
  // Range comparison instead of a computed date: it hits the walks_user_started_idx index.
  const dayStart = officeDayStart(day).toISOString();
  const nextDayStart = officeDayStart(addOfficeDays(day, 1)).toISOString();

  const [totals, streak, cruiseRow, segments, treadmillRow] = await Promise.all([
    db
      .select({
        walksCount: sql<number>`count(*)`.mapWith(Number),
        fastWalks: sql<number>`count(*) filter (where ${walks.speedKmh} >= ${STAYER_SPEED_KMH})`.mapWith(
          Number,
        ),
        totalKm: sql<number>`coalesce(sum(${walks.distanceKm}), 0)`.mapWith(Number),
        sameDayWalks: sql<number>`count(*) filter (
          where ${walks.startedAt} >= ${dayStart}::timestamptz
            and ${walks.startedAt} < ${nextDayStart}::timestamptz
        )`.mapWith(Number),
      })
      .from(walks)
      .where(and(eq(walks.userId, userId), eq(walks.status, 'finished')))
      .then((rows) => rows[0]),
    // Streak is computed for the walk's day, not "now": a walk started at 23:50
    // and finished past midnight must be checked against its own office day.
    getStreak(userId, walk.startedAt),
    // "Cruise control": walks with zero speed changes — left join instead of a
    // correlated exists in filter, which drizzle compiles incorrectly.
    db
      .select({ steadyWalks: sql<number>`count(*)`.mapWith(Number) })
      .from(walks)
      .leftJoin(walkSpeedSegments, eq(walkSpeedSegments.walkId, walks.id))
      .where(
        and(
          eq(walks.userId, userId),
          eq(walks.status, 'finished'),
          isNull(walkSpeedSegments.id),
        ),
      )
      .then((rows) => rows[0]),
    // Segments of the current walk: change count and full speed range.
    db
      .select({ speedKmh: walkSpeedSegments.speedKmh })
      .from(walkSpeedSegments)
      .where(eq(walkSpeedSegments.walkId, walkId)),
    db
      .select({ maxSpeedKmh: treadmills.maxSpeedKmh })
      .from(treadmills)
      .where(eq(treadmills.id, walk.treadmillId))
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  const hour = officeHour(walk.startedAt);
  const finishAt = walk.endedAt ?? walk.startedAt;
  const finishHour = officeHour(finishAt);
  const finishWeekday = officeWeekday(toOfficeDay(finishAt));
  const durationSec = walk.durationSec ?? 0;
  const distanceKm = Number(walk.distanceKm ?? 0);
  // All walk speeds: the starting one in `walks`, changes as separate segments.
  const speeds = [walk.speedKmh, ...segments.map((segment) => segment.speedKmh)];
  const maxSpeed = Math.max(...speeds);
  const minSpeed = Math.min(...speeds);
  const treadmillCeiling = treadmillRow?.maxSpeedKmh ?? 0;

  const earned: string[] = [];

  earned.push('first_walk'); // Any walk qualifies; the unique index drops duplicates.
  if (hour < EARLY_BIRD_BEFORE_HOUR) earned.push('early_bird');
  if (hour >= NIGHT_OWL_FROM_HOUR) earned.push('night_owl');
  if (hour >= LUNCH_FROM_HOUR && hour < LUNCH_TO_HOUR) earned.push('lunch_walker');
  if (finishWeekday === FRIDAY_WEEKDAY && finishHour >= FRIDAY_FROM_HOUR) {
    earned.push('friday_closer');
  }
  if (durationSec > MARATHON_MIN_SEC) earned.push('marathon');
  if (durationSec >= ZEN_MIN_SEC && maxSpeed <= ZEN_MAX_SPEED_KMH) earned.push('zen');
  if (distanceKm >= LONG_HAUL_KM) earned.push('long_haul');
  if (segments.length >= GEARBOX_CHANGES) earned.push('gearbox');
  if ((cruiseRow?.steadyWalks ?? 0) >= CRUISE_WALKS) earned.push('cruise');
  if (streak.days >= FIVE_DAYS_STREAK) earned.push('five_days');
  if (streak.days >= TEN_DAY_STREAK) earned.push('ten_day_streak');
  if ((totals?.walksCount ?? 0) >= TEN_WALKS) earned.push('ten_walks');
  if ((totals?.walksCount ?? 0) >= FIFTY_WALKS) earned.push('fifty_walks');
  if ((totals?.fastWalks ?? 0) >= STAYER_WALKS) earned.push('stayer');
  if (
    durationSec >= FULL_THROTTLE_MIN_SEC &&
    treadmillCeiling > 0 &&
    minSpeed >= treadmillCeiling
  ) {
    earned.push('full_throttle');
  }
  if ((totals?.totalKm ?? 0) >= FIFTY_KM) earned.push('fifty_km');
  if ((totals?.totalKm ?? 0) >= FIRST_HUNDRED_KM) earned.push('first_hundred');
  if ((totals?.sameDayWalks ?? 0) >= SAME_DAY_WALKS) earned.push('warm_treadmill');

  if (earned.length === 0) return [];

  // Once per participant: achievements_user_code_uniq drops duplicates, and
  // `returning` keeps only the rows inserted right now.
  const inserted = await db
    .insert(achievements)
    .values(earned.map((code) => ({ userId, code, walkId })))
    .onConflictDoNothing()
    .returning();

  const fresh = new Map(inserted.map((row) => [row.code, row.earnedAt]));

  return ACHIEVEMENTS.filter((item) => fresh.has(item.code)).flatMap((item) => {
    const dto = toDto(item.code, fresh.get(item.code) ?? null);
    return dto ? [dto] : [];
  });
}

/** Participant's earned achievements in catalog order — the card must not jump around. */
export async function listUserAchievements(userId: string): Promise<AchievementDto[]> {
  const rows = await db
    .select({ code: achievements.code, earnedAt: achievements.earnedAt })
    .from(achievements)
    .where(eq(achievements.userId, userId));

  const earned = new Map(rows.map((row) => [row.code, row.earnedAt]));

  return ACHIEVEMENTS.filter((item) => earned.has(item.code)).flatMap((item) => {
    const dto = toDto(item.code, earned.get(item.code) ?? null);
    return dto ? [dto] : [];
  });
}
