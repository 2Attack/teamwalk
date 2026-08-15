import { describe, expect, it } from 'vitest';

import { computeStreak } from '../lib/game/streak';

/**
 * August 2026 calendar (for readability of the cases):
 * Mon 03, Tue 04, Wed 05, Thu 06, Fri 07 | Sat 08, Sun 09 |
 * Mon 10, Tue 11, Wed 12, Thu 13, Fri 14 | Sat 15, Sun 16 | Mon 17, Tue 18 …
 */
const LIMIT = 2;

describe('computeStreak', () => {
  it('empty history — no streak, freezes untouched', () => {
    const result = computeStreak([], '2026-08-13', [], LIMIT);
    expect(result).toEqual({ days: 0, frozen: false, freezesLeft: 2, freezesToUse: [] });
  });

  it('counts consecutive workdays including today', () => {
    const result = computeStreak(
      ['2026-08-11', '2026-08-12', '2026-08-13'],
      '2026-08-13',
      [],
      LIMIT,
    );
    expect(result.days).toBe(3);
    expect(result.frozen).toBe(false);
  });

  it('walked yesterday, not yet today — streak alive, no freeze spent', () => {
    const result = computeStreak(['2026-08-11', '2026-08-12'], '2026-08-13', [], LIMIT);
    expect(result.days).toBe(2);
    expect(result.freezesToUse).toEqual([]);
    expect(result.freezesLeft).toBe(2);
  });

  it('weekends do not break the streak: Friday + Monday = 2 days', () => {
    const result = computeStreak(['2026-08-07', '2026-08-10'], '2026-08-10', [], LIMIT);
    expect(result.days).toBe(2);
    expect(result.frozen).toBe(false);
  });

  it('weekends do not grow the streak: a Saturday walk does not count', () => {
    const result = computeStreak(
      ['2026-08-07', '2026-08-08', '2026-08-10'],
      '2026-08-10',
      [],
      LIMIT,
    );
    expect(result.days).toBe(2);
  });

  it('today is a weekend — the streak counts from the last workday', () => {
    // Saturday the 15th: the Thu+Fri streak stays visible and needs no freezes.
    const result = computeStreak(['2026-08-13', '2026-08-14'], '2026-08-15', [], LIMIT);
    expect(result.days).toBe(2);
    expect(result.freezesToUse).toEqual([]);
  });

  it('one missed workday is covered by a freeze', () => {
    // Wednesday the 12th missed; the Tue → Thu streak does not break.
    const result = computeStreak(
      ['2026-08-11', '2026-08-13'],
      '2026-08-13',
      [],
      LIMIT,
    );
    expect(result.days).toBe(2);
    expect(result.frozen).toBe(true);
    expect(result.freezesToUse).toEqual(['2026-08-12']);
    expect(result.freezesLeft).toBe(1);
  });

  it('two misses in a month use two freezes, exhausting the limit', () => {
    // Wed 12 and Mon 10 missed; streak Tue 11 → Thu 13 → … → Fri 07.
    const result = computeStreak(
      ['2026-08-07', '2026-08-11', '2026-08-13'],
      '2026-08-13',
      [],
      LIMIT,
    );
    expect(result.days).toBe(3);
    expect(result.freezesToUse).toEqual(['2026-08-12', '2026-08-10']);
    expect(result.freezesLeft).toBe(0);
  });

  it('a third miss in a month resets the streak', () => {
    // Wed 12, Mon 10, and Fri 07 missed — no freeze left for the third, so the
    // streak ends at the 11th. The freeze for the 10th is not spent: there is
    // nothing left for it to save.
    const result = computeStreak(
      ['2026-08-06', '2026-08-11', '2026-08-13'],
      '2026-08-13',
      [],
      LIMIT,
    );
    expect(result.days).toBe(2);
    expect(result.freezesToUse).toEqual(['2026-08-12']);
    expect(result.freezesLeft).toBe(1);
  });

  it('an already-spent freeze counts against the month budget', () => {
    // The 5th was covered earlier, so the budget no longer stretches to the 10th.
    const result = computeStreak(
      ['2026-08-07', '2026-08-11', '2026-08-13'],
      '2026-08-13',
      ['2026-08-05'],
      LIMIT,
    );
    expect(result.days).toBe(2);
    expect(result.freezesToUse).toEqual(['2026-08-12']);
    expect(result.freezesLeft).toBe(0);
  });

  it('recomputation does not spend a freeze twice', () => {
    const result = computeStreak(
      ['2026-08-11', '2026-08-13'],
      '2026-08-13',
      ['2026-08-12'],
      LIMIT,
    );
    expect(result.days).toBe(2);
    expect(result.frozen).toBe(true);
    expect(result.freezesToUse).toEqual([]);
    expect(result.freezesLeft).toBe(1);
  });

  it('the freeze limit is per calendar month; last month does not eat the budget', () => {
    // The July 31 miss is covered by a July freeze; July spending does not affect August.
    const result = computeStreak(
      ['2026-07-30', '2026-08-03'],
      '2026-08-03',
      ['2026-07-29'],
      LIMIT,
    );
    expect(result.days).toBe(2);
    expect(result.freezesToUse).toEqual(['2026-07-31']);
    expect(result.freezesLeft).toBe(2);
  });

  it('a freeze is not spent when there is nothing to save', () => {
    // The only walk is today; no earlier days, no misses to cover.
    const result = computeStreak(['2026-08-13'], '2026-08-13', [], LIMIT);
    expect(result.days).toBe(1);
    expect(result.frozen).toBe(false);
    expect(result.freezesToUse).toEqual([]);
    expect(result.freezesLeft).toBe(2);
  });

  it('without freezes any miss resets the streak to zero', () => {
    const result = computeStreak(['2026-08-11'], '2026-08-13', [], 0);
    expect(result.days).toBe(0);
    expect(result.freezesToUse).toEqual([]);
    expect(result.freezesLeft).toBe(0);
  });

  it('an old streak with no walks this week does not resurrect', () => {
    const result = computeStreak(
      ['2026-08-03', '2026-08-04', '2026-08-05'],
      '2026-08-13',
      [],
      LIMIT,
    );
    expect(result.days).toBe(0);
    expect(result.freezesToUse).toEqual([]);
  });
});
