import { and, eq, inArray, sql } from 'drizzle-orm';

import { STREAK_FREEZES_PER_MONTH, TZ } from '../config';
import { streakFreezes, walks } from '../db/schema';
import { isWeekend, prevWorkday, toOfficeDay } from '../time';
import type { StreakDto } from '../types';

/**
 * Серии (п. 6.8.2 ТЗ).
 *
 * Серия нигде не хранится: денормализация рассинхронизировалась бы при удалении
 * прогулки (п. 7.7). Единственное сохраняемое состояние — израсходованные
 * заморозки, потому что «сколько пропусков уже прощено в этом месяце» из `walks`
 * не восстанавливается.
 */

/**
 * Офисный день прогулки считаем в SQL: границы суток — по `Europe/Moscow`,
 * иначе прогулка в 23:30 попадала бы в следующий день (п. 6.8.5).
 * `TZ` — константа конфига, не пользовательский ввод, поэтому `sql.raw` безопасен.
 */
const officeDayExpr = sql<string>`to_char(${walks.startedAt} AT TIME ZONE ${sql.raw(
  `'${TZ}'`,
)}, 'YYYY-MM-DD')`;

export interface StreakComputation {
  days: number;
  frozen: boolean;
  freezesLeft: number;
  /** Заморозки, которые нужно записать в `streak_freezes` по итогам расчёта. */
  freezesToUse: string[];
}

const monthOf = (day: string): string => day.slice(0, 7);

/**
 * Чистое ядро расчёта — вся логика серии здесь, чтобы её можно было покрыть тестами
 * без базы. Даты — офисные строки `YYYY-MM-DD`, сравнение строк совпадает
 * с хронологическим порядком.
 *
 * @param days        дни с хотя бы одной завершённой прогулкой (в любом порядке)
 * @param today       сегодняшний офисный день
 * @param freezesUsed уже израсходованные заморозки (даты пропущенных дней)
 * @param freezesLimit лимит заморозок на календарный месяц
 */
export function computeStreak(
  days: string[],
  today: string,
  freezesUsed: string[],
  freezesLimit: number,
): StreakComputation {
  // Прогулки в выходные серию не увеличивают, поэтому в расчёт не попадают вовсе.
  const walked = new Set(days.filter((day) => !isWeekend(day)));
  const usedSet = new Set(freezesUsed);
  const currentMonth = monthOf(today);

  /** Занято заморозок в месяце: уже записанные плюс запланированные этим расчётом. */
  const spentIn = (month: string, planned: readonly string[]): number =>
    freezesUsed.filter((day) => monthOf(day) === month).length +
    planned.filter((day) => monthOf(day) === month && !usedSet.has(day)).length;

  /** Заморозки, которые реально держат текущую серию. */
  const committed: string[] = [];
  /** Заморозки после последнего засчитанного дня — пока неизвестно, спасают ли они что-то. */
  let pending: string[] = [];
  let streak = 0;

  const earliest = walked.size > 0 ? [...walked].sort()[0] : null;

  if (earliest !== null) {
    // Сегодняшний день без прогулки — ещё не пропуск: рабочий день не закончился,
    // тратить на него заморозку рано. Отсчёт начинаем с предыдущего рабочего дня.
    let cursor = isWeekend(today) || !walked.has(today) ? prevWorkday(today) : today;

    while (cursor >= earliest) {
      if (walked.has(cursor)) {
        streak += 1;
        // Пропуски «за спиной» подтверждаются только когда нашёлся день, который они спасают:
        // иначе заморозка сгорела бы впустую в самом начале истории.
        committed.push(...pending);
        pending = [];
      } else {
        const planned = committed.concat(pending);
        // Уже оплаченный ранее пропуск повторно бюджет не тратит.
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
 * Подключение к БД подтягивается лениво: `lib/db` падает без `DATABASE_URL`,
 * а чистый `computeStreak` должен импортироваться в юнит-тестах без окружения.
 */
async function database() {
  const { db } = await import('../db');
  return db;
}

/** Фиксация расхода заморозок: пропуск гасится один раз, а не при каждом расчёте. */
async function persistFreezes(rows: { userId: string; usedOn: string }[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await database();
  // Гонку двух параллельных расчётов разруливает индекс streak_freezes_uniq.
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
 * Серии сразу для списка участников. Лидерборд зовёт это на сотню человек,
 * поэтому запросов ровно два — на дни и на заморозки, независимо от размера списка.
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

  // Один общий insert на всех: расход заморозок не должен превращаться в N запросов.
  await persistFreezes(pending);

  return streaks;
}
