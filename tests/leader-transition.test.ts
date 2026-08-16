import { describe, expect, it } from 'vitest';

import { observe } from '../lib/client/leader-transition';

/**
 * Truth table from specs/001-first-place-fireworks/data-model.md.
 * `fire` may be true only for an observed leader change within the same
 * standings (same period key); everything else re-baselines silently.
 */
describe('observe', () => {
  it('initial load never fires: null state establishes a baseline', () => {
    expect(observe(null, 'week', 'B')).toEqual({
      fire: false,
      next: { periodKey: 'week', leaderId: 'B' },
    });
  });

  it('period tab switch is not a leader change', () => {
    expect(observe({ periodKey: 'week', leaderId: 'A' }, 'all', 'B')).toEqual({
      fire: false,
      next: { periodKey: 'all', leaderId: 'B' },
    });
  });

  it('same leader on refresh does not fire', () => {
    expect(observe({ periodKey: 'week', leaderId: 'A' }, 'week', 'A')).toEqual({
      fire: false,
      next: { periodKey: 'week', leaderId: 'A' },
    });
  });

  it('leader change within the same period fires', () => {
    expect(observe({ periodKey: 'week', leaderId: 'A' }, 'week', 'B')).toEqual({
      fire: true,
      next: { periodKey: 'week', leaderId: 'B' },
    });
  });

  it('podium emptying resets the baseline without firing', () => {
    expect(observe({ periodKey: 'week', leaderId: 'A' }, 'week', null)).toEqual({
      fire: false,
      next: null,
    });
  });

  it('re-population after emptying is a fresh baseline, not a change', () => {
    const emptied = observe({ periodKey: 'week', leaderId: 'A' }, 'week', null);
    expect(observe(emptied.next, 'week', 'B')).toEqual({
      fire: false,
      next: { periodKey: 'week', leaderId: 'B' },
    });
  });

  it('no leader before and after stays inert', () => {
    expect(observe(null, 'week', null)).toEqual({ fire: false, next: null });
  });
});
