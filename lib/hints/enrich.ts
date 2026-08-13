/**
 * Чистые вычисления для обогащения снапшота хинтов (без БД).
 *
 * Принцип тот же, что у `route_position`: всю арифметику — разности, ранги,
 * прогнозы — считаем мы, модель числа только цитирует. На вычислениях LLM
 * ошибается охотнее всего, а «u2 отстаёт на 3.4 км» с неверным числом рядом
 * с настоящей таблицей убивает доверие к ленте.
 */

const ROUND = (value: number): number => Math.round(value * 100) / 100;

/** Рабочих дней в неделе — темп «догонит через N дней» считается по ним. */
const WORKDAYS_PER_WEEK = 5;

/** Прогноз дальше этого горизонта — уже не шутка, а гадание. */
const CATCHUP_MAX_DAYS = 60;

export interface MilestoneInfo {
  /** Ближайший круглый рубеж, кратный 100 км. */
  at: number;
  /** Сколько осталось до него. */
  left: number;
}

/** Ближайший командный рубеж: до 500 км осталось 12 — кто добьёт? */
export function nextMilestone(totalKm: number): MilestoneInfo {
  const at = Math.max(100, Math.ceil(totalKm / 100) * 100);
  // Ровно на рубеже — целимся в следующий: «осталось 0» шуткой не станет.
  const target = at === totalKm ? at + 100 : at;
  return { at: target, left: ROUND(target - totalKm) };
}

export interface RankChangeInput {
  id: string;
  name: string;
  totalKm: number;
  kmWeek: number;
}

/**
 * Изменение места за неделю: ранг по «тоталу минус неделя» против ранга сейчас.
 * Положительное значение — поднялся. Тай-брейк тот же, что в рейтинге: имя.
 */
export function rankChanges(input: readonly RankChangeInput[]): Map<string, number> {
  const byTotal = [...input].sort(
    (a, b) => b.totalKm - a.totalKm || a.name.localeCompare(b.name),
  );
  const byPrev = [...input].sort(
    (a, b) => b.totalKm - b.kmWeek - (a.totalKm - a.kmWeek) || a.name.localeCompare(b.name),
  );
  const prevRank = new Map(byPrev.map((user, index) => [user.id, index + 1]));

  return new Map(
    byTotal.map((user, index) => [user.id, (prevRank.get(user.id) ?? index + 1) - (index + 1)]),
  );
}

/**
 * Через сколько рабочих дней догоняющий поравняется с лидером, если оба
 * сохранят темп этой недели. `null` — не догоняет (темп не выше) или прогноз
 * дальше горизонта: такие «догонит через 400 дней» веселья не добавляют.
 */
export function catchupDays(
  gapKm: number,
  chaserWeekKm: number,
  leaderWeekKm: number,
): number | null {
  if (gapKm <= 0) return null;
  const gainPerDay = (chaserWeekKm - leaderWeekKm) / WORKDAYS_PER_WEEK;
  if (gainPerDay <= 0) return null;
  const days = Math.ceil(gapKm / gainPerDay);
  return days > CATCHUP_MAX_DAYS ? null : days;
}
