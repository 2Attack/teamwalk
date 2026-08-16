import { TZ } from './config';

/**
 * Day and week arithmetic in `Europe/Moscow`.
 *
 * Boundaries are computed by Intl formatting, not by shifting a fixed number
 * of hours: the zone offset can change, the `YYYY-MM-DD` format cannot.
 */

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Local date in the office timezone: `2026-08-11`. */
export function toOfficeDay(date: Date = new Date()): string {
  return dayFormatter.format(date);
}

/** Zone offset in minutes at a given moment (respects historical rules). */
function tzOffsetMinutes(date: Date): number {
  const asUtc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const asOffice = new Date(date.toLocaleString('en-US', { timeZone: TZ }));
  return (asOffice.getTime() - asUtc.getTime()) / 60_000;
}

/** The `00:00` moment of office day `YYYY-MM-DD` in UTC. */
export function officeDayStart(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const offset = tzOffsetMinutes(guess);
  return new Date(guess.getTime() - offset * 60_000);
}

/** Add days to an office date string. */
export function addOfficeDays(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + delta));
  return next.toISOString().slice(0, 10);
}

/** Difference in days between two office dates (a - b). */
export function diffOfficeDays(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday. */
export function officeWeekday(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** Weekend = Saturday or Sunday. No public-holiday calendar in the MVP (spec § 6.8.5). */
export function isWeekend(day: string): boolean {
  const wd = officeWeekday(day);
  return wd === 0 || wd === 6;
}

const hourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  hourCycle: 'h23',
});

/** Hour of day (0-23) in the office timezone — notification window (spec § 6.10.5). */
export function officeHour(date: Date = new Date()): number {
  return Number(hourFormatter.format(date));
}

/**
 * Number of workdays in the office-date interval `(from; to]` — right bound
 * inclusive, left exclusive. All reminder cadences (spec § 6.10.4) rest on
 * this half-open interval: "N workdays passed since event X".
 */
export function workdaysSince(from: string, to: string): number {
  let count = 0;
  for (let day = addOfficeDays(from, 1); day <= to; day = addOfficeDays(day, 1)) {
    if (!isWeekend(day)) count += 1;
  }
  return count;
}

/** Previous workday before the given day. */
export function prevWorkday(day: string): string {
  let cur = addOfficeDays(day, -1);
  while (isWeekend(cur)) cur = addOfficeDays(cur, -1);
  return cur;
}

/** Leaderboard period start. Week = Monday 00:00 Moscow time (spec § 6.8.2). */
export function periodStart(period: 'week' | 'month' | 'all', now: Date = new Date()): Date {
  if (period === 'all') return new Date(0);
  const today = toOfficeDay(now);
  if (period === 'month') return officeDayStart(`${today.slice(0, 7)}-01`);
  const wd = officeWeekday(today);
  const backToMonday = (wd + 6) % 7;
  return officeDayStart(addOfficeDays(today, -backToMonday));
}

/**
 * Bounds of an arbitrary office-date period `[from; to]` (both inclusive):
 * start is midnight of `from`, end is the exclusive midnight after `to`.
 */
export function officeRange(from: string, to: string): { since: Date; until: Date } {
  return { since: officeDayStart(from), until: officeDayStart(addOfficeDays(to, 1)) };
}

/** `YYYY-MM` of the current office month — for the freeze limit. */
export function officeMonth(date: Date = new Date()): string {
  return toOfficeDay(date).slice(0, 7);
}
