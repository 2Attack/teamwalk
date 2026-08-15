import { describe, expect, it } from 'vitest';

import { reminderDecision, type ReminderFacts } from '../lib/telegram/remind-rules';
import { workdaysSince } from '../lib/time';

/**
 * "Time to stretch" reminder rules (spec § 6.10.4). Only the send / don't-send
 * decision by facts is tested here; the delivery window (weekday, hour) is the
 * scheduler's job and deliberately outside `reminderDecision`.
 *
 * August 2026 calendar (same as in streak.test.ts):
 * Mon 03, Tue 04, Wed 05, Thu 06, Fri 07 | Sat 08, Sun 09 |
 * Mon 10, Tue 11, Wed 12, Thu 13, Fri 14 | Sat 15, Sun 16 | Mon 17, Tue 18 …
 */

/** Baseline: a long-time member, last walk on Friday, no reminders yet. */
const BASE: ReminderFacts = {
  today: '2026-08-13', // Thursday
  userCreatedDay: '2026-07-01',
  lastWalkDay: '2026-08-07', // Friday — idle by Thursday: Mon+Tue+Wed = 3 full days
  linkedDay: '2026-07-01',
  lastRemindDay: null,
  remindsSinceWalk: 0,
};

function facts(overrides: Partial<ReminderFacts>): ReminderFacts {
  return { ...BASE, ...overrides };
}

describe('reminderDecision: newcomers', () => {
  it('a member younger than 3 days gets no reminder even after a long idle', () => {
    // Created on Tuesday the 11th, today is Thursday the 13th: diffOfficeDays = 2 < 3.
    // The last walk was long ago — a huge idle, but a newcomer has not "quit" anything yet.
    const result = reminderDecision(
      facts({ userCreatedDay: '2026-08-11', lastWalkDay: '2026-08-03' }),
    );
    expect(result).toBe(false);
  });

  it('exactly 3 calendar days since creation — no longer a newcomer', () => {
    // Created on Monday the 10th: diffOfficeDays('2026-08-13', '2026-08-10') = 3.
    const result = reminderDecision(
      facts({ userCreatedDay: '2026-08-10', lastWalkDay: '2026-08-03' }),
    );
    expect(result).toBe(true);
  });
});

describe('reminderDecision: idle time in workdays', () => {
  it('walked yesterday (a workday) — 0 full idle days, no reminder', () => {
    expect(reminderDecision(facts({ lastWalkDay: '2026-08-12' }))).toBe(false);
  });

  it('walked today — all the more no reminder', () => {
    expect(reminderDecision(facts({ lastWalkDay: '2026-08-13' }))).toBe(false);
  });

  it('Friday → Tuesday: only Monday missed, 1 < 2 — too early', () => {
    expect(
      reminderDecision(facts({ lastWalkDay: '2026-08-07', today: '2026-08-11' })),
    ).toBe(false);
  });

  it('Friday → Wednesday: Mon and Tue missed, 2 full days — time', () => {
    expect(
      reminderDecision(facts({ lastWalkDay: '2026-08-07', today: '2026-08-12' })),
    ).toBe(true);
  });

  it('weekends do not count: Thursday → Monday — only Friday missed', () => {
    expect(
      reminderDecision(facts({ lastWalkDay: '2026-08-06', today: '2026-08-10' })),
    ).toBe(false);
  });

  it('Thursday → Tuesday: Fri and Mon missed — time', () => {
    expect(
      reminderDecision(facts({ lastWalkDay: '2026-08-06', today: '2026-08-11' })),
    ).toBe(true);
  });

  it('today is Saturday — "today" is not subtracted from the idle time', () => {
    // Walked Wednesday the 12th, today is Saturday the 15th: Thu+Fri = 2 full days missed.
    // The window (no sends on weekends) is checked elsewhere — this is the facts-based "time" decision.
    expect(
      reminderDecision(facts({ lastWalkDay: '2026-08-12', today: '2026-08-15' })),
    ).toBe(true);
  });
});

describe('reminderDecision: never walked — linkedDay as the baseline', () => {
  it('linked on Friday, today is Thursday: 3 idle days — time', () => {
    expect(
      reminderDecision(facts({ lastWalkDay: null, linkedDay: '2026-08-07' })),
    ).toBe(true);
  });

  it('linked on Tuesday, today is Thursday: only Wednesday missed — too early', () => {
    expect(
      reminderDecision(facts({ lastWalkDay: null, linkedDay: '2026-08-11' })),
    ).toBe(false);
  });
});

describe('reminderDecision: cooldown between reminders', () => {
  it('a reminder went out yesterday (1 workday ago) — stay silent', () => {
    const result = reminderDecision(
      facts({ lastWalkDay: '2026-08-05', lastRemindDay: '2026-08-12', remindsSinceWalk: 1 }),
    );
    expect(result).toBe(false);
  });

  it('a reminder went out 2 workdays ago — still silent', () => {
    const result = reminderDecision(
      facts({ lastWalkDay: '2026-08-05', lastRemindDay: '2026-08-11', remindsSinceWalk: 1 }),
    );
    expect(result).toBe(false);
  });

  it('exactly 3 workdays ago — cooldown expired, allowed', () => {
    const result = reminderDecision(
      facts({ lastWalkDay: '2026-08-05', lastRemindDay: '2026-08-10', remindsSinceWalk: 1 }),
    );
    expect(result).toBe(true);
  });

  it('the cooldown counts workdays: Friday → Wednesday is exactly 3', () => {
    // Friday 07 → Wednesday 12: Mon+Tue+Wed = 3 workdays; Saturday and Sunday do not count.
    const result = reminderDecision(
      facts({
        lastWalkDay: '2026-08-03',
        today: '2026-08-12',
        lastRemindDay: '2026-08-07',
        remindsSinceWalk: 1,
      }),
    );
    expect(result).toBe(true);
  });
});

describe('reminderDecision: backoff and silence', () => {
  it('after 3 reminders the cooldown grows to 5: 3 workdays is not enough', () => {
    const result = reminderDecision(
      facts({ lastWalkDay: '2026-07-27', lastRemindDay: '2026-08-10', remindsSinceWalk: 3 }),
    );
    expect(result).toBe(false);
  });

  it('after 3 reminders: 5 workdays since the last one — allowed', () => {
    // Thursday 06 → Thursday 13: Fri 07, Mon 10, Tue 11, Wed 12, Thu 13 = 5.
    const result = reminderDecision(
      facts({ lastWalkDay: '2026-07-27', lastRemindDay: '2026-08-06', remindsSinceWalk: 3 }),
    );
    expect(result).toBe(true);
  });

  it('2 reminders — backoff not yet active, the usual 3 days suffice', () => {
    const result = reminderDecision(
      facts({ lastWalkDay: '2026-07-27', lastRemindDay: '2026-08-10', remindsSinceWalk: 2 }),
    );
    expect(result).toBe(true);
  });

  it('5 reminders — still backoff, 5 workdays suffice', () => {
    const result = reminderDecision(
      facts({ lastWalkDay: '2026-07-27', lastRemindDay: '2026-08-06', remindsSinceWalk: 5 }),
    );
    expect(result).toBe(true);
  });

  it('after 6 reminders — silence, no matter how old the last one is', () => {
    const result = reminderDecision(
      facts({ lastWalkDay: '2026-07-01', lastRemindDay: '2026-07-15', remindsSinceWalk: 6 }),
    );
    expect(result).toBe(false);
  });

  it('7 reminders — silence too (the "at least 6" threshold)', () => {
    const result = reminderDecision(
      facts({ lastWalkDay: '2026-07-01', lastRemindDay: null, remindsSinceWalk: 7 }),
    );
    expect(result).toBe(false);
  });
});

describe('reminderDecision: the clean case', () => {
  it('idle long enough, no reminders yet — send', () => {
    expect(
      reminderDecision(facts({ lastRemindDay: null, remindsSinceWalk: 0 })),
    ).toBe(true);
  });
});

describe('workdaysSince: half-open interval contract (from; to]', () => {
  it('from === to → 0: the event day is outside the interval', () => {
    expect(workdaysSince('2026-08-13', '2026-08-13')).toBe(0);
  });

  it('adjacent workdays → 1: the right bound is included, the left is not', () => {
    expect(workdaysSince('2026-08-12', '2026-08-13')).toBe(1);
  });

  it('weekends are skipped: Friday → Monday = 1', () => {
    expect(workdaysSince('2026-08-07', '2026-08-10')).toBe(1);
  });

  it('an interval across a weekend: Thursday 06 → Tuesday 11 = 3 (Fri, Mon, Tue)', () => {
    expect(workdaysSince('2026-08-06', '2026-08-11')).toBe(3);
  });
});
