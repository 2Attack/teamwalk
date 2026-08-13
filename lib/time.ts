import { TZ } from './config';

/**
 * Работа с сутками и неделями в `Europe/Moscow`.
 *
 * Границы считаются форматированием через Intl, а не сдвигом на фиксированные
 * часы: смещение зоны может измениться, а формат `YYYY-MM-DD` — нет.
 */

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Локальная дата в офисном часовом поясе: `2026-08-11`. */
export function toOfficeDay(date: Date = new Date()): string {
  return dayFormatter.format(date);
}

/** Смещение зоны в минутах для конкретного момента (учитывает историю правил). */
function tzOffsetMinutes(date: Date): number {
  const asUtc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const asOffice = new Date(date.toLocaleString('en-US', { timeZone: TZ }));
  return (asOffice.getTime() - asUtc.getTime()) / 60_000;
}

/** Момент `00:00` офисного дня `YYYY-MM-DD` в UTC. */
export function officeDayStart(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const offset = tzOffsetMinutes(guess);
  return new Date(guess.getTime() - offset * 60_000);
}

/** Прибавить дней к офисной дате-строке. */
export function addOfficeDays(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + delta));
  return next.toISOString().slice(0, 10);
}

/** Разница в днях между двумя офисными датами (a - b). */
export function diffOfficeDays(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

/** 0 = воскресенье … 6 = суббота. */
export function officeWeekday(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** Выходной = суббота или воскресенье. Производственный календарь в MVP не заводится (п. 6.8.5). */
export function isWeekend(day: string): boolean {
  const wd = officeWeekday(day);
  return wd === 0 || wd === 6;
}

/** Предыдущий рабочий день перед указанным. */
export function prevWorkday(day: string): string {
  let cur = addOfficeDays(day, -1);
  while (isWeekend(cur)) cur = addOfficeDays(cur, -1);
  return cur;
}

/** Начало периода лидерборда. Неделя — понедельник 00:00 по Москве (п. 6.8.2). */
export function periodStart(period: 'week' | 'month' | 'all', now: Date = new Date()): Date {
  if (period === 'all') return new Date(0);
  const today = toOfficeDay(now);
  if (period === 'month') return officeDayStart(`${today.slice(0, 7)}-01`);
  const wd = officeWeekday(today);
  const backToMonday = (wd + 6) % 7;
  return officeDayStart(addOfficeDays(today, -backToMonday));
}

/**
 * Границы произвольного периода `[from; to]` из офисных дат (обе включительно):
 * старт — полночь `from`, конец — эксклюзивная полночь дня после `to`.
 */
export function officeRange(from: string, to: string): { since: Date; until: Date } {
  return { since: officeDayStart(from), until: officeDayStart(addOfficeDays(to, 1)) };
}

/** `YYYY-MM` текущего офисного месяца — для лимита заморозок. */
export function officeMonth(date: Date = new Date()): string {
  return toOfficeDay(date).slice(0, 7);
}
