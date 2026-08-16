import { describe, expect, it } from 'vitest';

import { catchupDays, nextMilestone, rankChanges } from '@/lib/hints/enrich';

describe('nextMilestone', () => {
  it('targets the nearest hundred', () => {
    expect(nextMilestone(488)).toEqual({ at: 500, left: 12 });
    expect(nextMilestone(12.5)).toEqual({ at: 100, left: 87.5 });
  });

  it('at zero and exactly on a milestone looks ahead, not at "0 left"', () => {
    expect(nextMilestone(0)).toEqual({ at: 100, left: 100 });
    expect(nextMilestone(500)).toEqual({ at: 600, left: 100 });
  });

  it('rounds the remainder to hundredths', () => {
    expect(nextMilestone(99.999).left).toBe(0);
    expect(nextMilestone(455.333)).toEqual({ at: 500, left: 44.67 });
  });
});

describe('rankChanges', () => {
  const user = (id: string, totalKm: number, kmWeek: number) => ({
    id,
    name: id,
    totalKm,
    kmWeek,
  });

  it('an overtake within the week gives +1 to the overtaker and −1 to the overtaken', () => {
    // A week ago: a=10, b=8. Now: a=11, b=14 — b jumped over a.
    const changes = rankChanges([user('a', 11, 1), user('b', 14, 6)]);
    expect(changes.get('b')).toBe(1);
    expect(changes.get('a')).toBe(-1);
  });

  it('with no walks this week everyone stays put', () => {
    const changes = rankChanges([user('a', 10, 0), user('b', 5, 0)]);
    expect(changes.get('a')).toBe(0);
    expect(changes.get('b')).toBe(0);
  });

  it('the name tie-break matches the leaderboard and produces no false jumps', () => {
    // Equal totals all week: order is stable, changes are zero.
    const changes = rankChanges([user('b', 10, 0), user('a', 10, 0)]);
    expect(changes.get('a')).toBe(0);
    expect(changes.get('b')).toBe(0);
  });
});

describe('catchupDays', () => {
  it('counts days from the weekly pace difference', () => {
    // The chaser does 5 km/week more → +1 km per workday; the gap is 3 km.
    expect(catchupDays(3, 10, 5)).toBe(3);
  });

  it('rounds up — "catches up in 2.1 days" never happens', () => {
    expect(catchupDays(2.1, 10, 5)).toBe(3);
  });

  it('never catches up at an equal or worse pace', () => {
    expect(catchupDays(3, 5, 5)).toBeNull();
    expect(catchupDays(3, 4, 5)).toBeNull();
  });

  it('discards a forecast too far out', () => {
    expect(catchupDays(100, 6, 5)).toBeNull();
  });

  it('a zero or negative gap is not a story', () => {
    expect(catchupDays(0, 10, 5)).toBeNull();
  });
});
