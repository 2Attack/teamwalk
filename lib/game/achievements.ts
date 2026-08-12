import { and, eq, sql } from 'drizzle-orm';

import { TZ } from '../config';
import { db } from '../db';
import { achievements, walks } from '../db/schema';
import { addOfficeDays, officeDayStart, toOfficeDay } from '../time';
import type { AchievementDto } from '../types';

import { getStreak } from './streak';

/**
 * Достижения (п. 6.8.3 ТЗ) — за характер, а не за объём: ачивки за километраж
 * снова выигрывает лидер, поэтому почти все условия доступны любому участнику.
 *
 * Отзыва достижений нет намеренно (п. 7.7): снимать уже показанную ачивку при
 * удалении прогулки — худший из вариантов поведения.
 */

export const ACHIEVEMENTS: ReadonlyArray<{ code: string; title: string; description: string }> = [
  { code: 'early_bird', title: 'Ранняя пташка', description: 'Прогулка начата до 9:00' },
  { code: 'night_owl', title: 'Сова', description: 'Прогулка начата после 18:00' },
  { code: 'marathon', title: 'Марафон', description: 'Одна прогулка дольше часа' },
  { code: 'five_days', title: 'Пятидневка', description: '5 рабочих дней подряд' },
  { code: 'stayer', title: 'Стайер', description: '10 прогулок на скорости 7+ км/ч' },
  { code: 'first_hundred', title: 'Первая сотня', description: '100 км суммарно' },
  { code: 'warm_treadmill', title: 'Дорожка не остыла', description: 'Две прогулки в один день' },
];

/** Пороги условий. Значения смысловые, а не настроечные, поэтому живут рядом с каталогом. */
const EARLY_BIRD_BEFORE_HOUR = 9;
const NIGHT_OWL_FROM_HOUR = 18;
const MARATHON_MIN_SEC = 3600;
const FIVE_DAYS_STREAK = 5;
const STAYER_SPEED_KMH = 7;
const STAYER_WALKS = 10;
const FIRST_HUNDRED_KM = 100;
const SAME_DAY_WALKS = 2;

const CATALOG = new Map(ACHIEVEMENTS.map((item) => [item.code, item]));

/**
 * Час начала прогулки в офисном поясе: «до 9:00» для человека в Москве — это
 * московские 9:00, а не UTC (п. 6.8.5).
 */
const hourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  hourCycle: 'h23',
});

const officeHour = (date: Date): number => Number(hourFormatter.format(date));

const toDto = (code: string, earnedAt: Date | null): AchievementDto | null => {
  const item = CATALOG.get(code);
  // Код не из каталога (остаток снятой механики) молча пропускаем, а не падаем.
  if (!item) return null;
  return { ...item, earnedAt: earnedAt ? earnedAt.toISOString() : null };
};

/**
 * Начисление по факту завершения прогулки. Вызывается из `POST /api/walks/:id/finish`,
 * возвращает только реально новые ачивки — их показывает экран успеха.
 */
export async function awardAchievements(userId: string, walkId: string): Promise<AchievementDto[]> {
  const [walk] = await db.select().from(walks).where(eq(walks.id, walkId)).limit(1);
  // Достижения только за свою завершённую прогулку: автозакрытая и отменённая не считаются.
  if (!walk || walk.userId !== userId || walk.status !== 'finished') return [];

  const day = toOfficeDay(walk.startedAt);
  // Сравнение по диапазону, а не по вычисленной дате: попадает в индекс walks_user_started_idx.
  const dayStart = officeDayStart(day).toISOString();
  const nextDayStart = officeDayStart(addOfficeDays(day, 1)).toISOString();

  const [totals, streak] = await Promise.all([
    db
      .select({
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
    // Серию считаем на день прогулки, а не на «сейчас»: прогулка, начатая в 23:50
    // и закрытая после полуночи, должна проверяться по своему офисному дню.
    getStreak(userId, walk.startedAt),
  ]);

  const hour = officeHour(walk.startedAt);
  const earned: string[] = [];

  if (hour < EARLY_BIRD_BEFORE_HOUR) earned.push('early_bird');
  if (hour >= NIGHT_OWL_FROM_HOUR) earned.push('night_owl');
  if ((walk.durationSec ?? 0) > MARATHON_MIN_SEC) earned.push('marathon');
  if (streak.days >= FIVE_DAYS_STREAK) earned.push('five_days');
  if ((totals?.fastWalks ?? 0) >= STAYER_WALKS) earned.push('stayer');
  if ((totals?.totalKm ?? 0) >= FIRST_HUNDRED_KM) earned.push('first_hundred');
  if ((totals?.sameDayWalks ?? 0) >= SAME_DAY_WALKS) earned.push('warm_treadmill');

  if (earned.length === 0) return [];

  // Один раз на участника: дубль отсекает achievements_user_code_uniq, а `returning`
  // оставляет только те строки, которые вставились именно сейчас.
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

/** Полученные достижения участника в порядке каталога — карточка не должна прыгать. */
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
