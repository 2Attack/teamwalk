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
 * Reminder frequency and backoff rules (spec § 6.10.4).
 *
 * Pure module, no DB: facts arrive as office days `YYYY-MM-DD`, so the logic
 * is unit-testable without `DATABASE_URL`. The send-window check (workday,
 * 11–17 MSK) is shared with the digest and lives in the sweep (spec § 6.10.5).
 */

export interface ReminderFacts {
  /** Today's office day `YYYY-MM-DD`. */
  today: string;
  userCreatedDay: string;
  /** Day of the last finished walk; null — no walks yet. */
  lastWalkDay: string | null;
  /** Linking day — the baseline when there are no walks. */
  linkedDay: string;
  lastRemindDay: string | null;
  /** Reminders sent since the last walk (or linking, if no walks). */
  remindsSinceWalk: number;
}

export function reminderDecision(facts: ReminderFacts): boolean {
  // Newcomers get no reminders (spec § 6.10.4): they have not "dropped" anything yet.
  if (diffOfficeDays(facts.today, facts.userCreatedDay) < HINTS_NEWCOMER_DAYS) return false;

  // Idle time counts only fully missed workdays: today is still in progress
  // and is not a miss, so on a workday it is subtracted.
  const baseline = facts.lastWalkDay ?? facts.linkedDay;
  const idleWorkdays = workdaysSince(baseline, facts.today) - (isWeekend(facts.today) ? 0 : 1);
  if (idleWorkdays < REMIND_IDLE_WORKDAYS) return false;

  // Backoff to silence: someone ignoring six reminders has decided — respect
  // it without /stop. The next finish resets the counter.
  if (facts.remindsSinceWalk >= REMIND_SILENCE_AFTER) return false;

  // After the third reminder without a walk, frequency drops to once a week.
  const cooldown =
    facts.remindsSinceWalk >= REMIND_BACKOFF_AFTER
      ? REMIND_BACKOFF_COOLDOWN_WORKDAYS
      : REMIND_COOLDOWN_WORKDAYS;
  if (facts.lastRemindDay !== null && workdaysSince(facts.lastRemindDay, facts.today) < cooldown) {
    return false;
  }

  return true;
}
