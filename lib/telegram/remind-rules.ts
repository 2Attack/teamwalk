import {
  HINTS_NEWCOMER_DAYS,
  REMIND_BACKOFF_AFTER,
  REMIND_BACKOFF_COOLDOWN_WORKDAYS,
  REMIND_COOLDOWN_WORKDAYS,
  REMIND_IDLE_WORKDAYS,
  REMIND_SILENCE_AFTER,
} from '@/lib/config';
import { diffOfficeDays, isWeekend, workdaysSince } from '@/lib/time';

/**
 * Правила частоты и затухания напоминаний (п. 6.10.4 ТЗ).
 *
 * Чистый модуль без БД: все факты приходят снаружи офисными датами
 * `YYYY-MM-DD`, поэтому логика покрывается юнит-тестами без `DATABASE_URL`.
 * Проверка окна отправки (рабочий день, 11–17 МСК) сюда не входит —
 * она общая для напоминаний и дайджеста и живёт в sweep (п. 6.10.5).
 */

export interface ReminderFacts {
  /** Сегодняшний офисный день `YYYY-MM-DD`. */
  today: string;
  userCreatedDay: string;
  /** День последней завершённой прогулки; null — прогулок не было. */
  lastWalkDay: string | null;
  /** День привязки — базовая точка отсчёта, если прогулок не было. */
  linkedDay: string;
  lastRemindDay: string | null;
  /** Напоминаний после последней прогулки (или привязки, если прогулок нет). */
  remindsSinceWalk: number;
}

export function reminderDecision(facts: ReminderFacts): boolean {
  // Новички не напоминаются (п. 6.10.4): они ещё ничего не «забросили».
  if (diffOfficeDays(facts.today, facts.userCreatedDay) < HINTS_NEWCOMER_DAYS) return false;

  // Простой считаем только полностью пропущенными рабочими днями: сегодняшний
  // день ещё идёт и пропуском не является, поэтому в рабочий день вычитаем его.
  const baseline = facts.lastWalkDay ?? facts.linkedDay;
  const idleWorkdays = workdaysSince(baseline, facts.today) - (isWeekend(facts.today) ? 0 : 1);
  if (idleWorkdays < REMIND_IDLE_WORKDAYS) return false;

  // Затухание до молчания: человек, не отвечающий на шесть напоминаний,
  // принял решение — уважаем его без команды /stop. Счётчик обнулит первый финиш.
  if (facts.remindsSinceWalk >= REMIND_SILENCE_AFTER) return false;

  // После третьего напоминания без прогулки частота падает до раза в неделю.
  const cooldown =
    facts.remindsSinceWalk >= REMIND_BACKOFF_AFTER
      ? REMIND_BACKOFF_COOLDOWN_WORKDAYS
      : REMIND_COOLDOWN_WORKDAYS;
  if (facts.lastRemindDay !== null && workdaysSince(facts.lastRemindDay, facts.today) < cooldown) {
    return false;
  }

  return true;
}
