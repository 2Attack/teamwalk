import { describe, expect, it } from 'vitest';

import { officeRange } from '../lib/time';
import { periodSelectionSchema } from '../lib/validation';

describe('periodSelectionSchema', () => {
  it('accepts preset periods', () => {
    for (const period of ['week', 'month', 'all'] as const) {
      expect(periodSelectionSchema.parse({ period })).toEqual({ period });
    }
  });

  it('defaults to week', () => {
    expect(periodSelectionSchema.parse({ period: undefined })).toEqual({ period: 'week' });
  });

  it('accepts a custom period with valid bounds', () => {
    const parsed = periodSelectionSchema.parse({
      period: 'custom',
      from: '2026-08-01',
      to: '2026-08-13',
    });
    expect(parsed).toEqual({ period: 'custom', from: '2026-08-01', to: '2026-08-13' });
  });

  it('accepts a single-day period', () => {
    expect(
      periodSelectionSchema.safeParse({ period: 'custom', from: '2026-08-13', to: '2026-08-13' })
        .success,
    ).toBe(true);
  });

  it('rejects custom without bounds', () => {
    expect(periodSelectionSchema.safeParse({ period: 'custom' }).success).toBe(false);
    expect(
      periodSelectionSchema.safeParse({ period: 'custom', from: '2026-08-01' }).success,
    ).toBe(false);
  });

  it('rejects a start later than the end', () => {
    expect(
      periodSelectionSchema.safeParse({ period: 'custom', from: '2026-08-13', to: '2026-08-01' })
        .success,
    ).toBe(false);
  });

  it('rejects garbage instead of a date and nonexistent dates', () => {
    for (const bad of ['13.08.2026', '2026-8-1', 'вчера', '2026-02-31']) {
      expect(
        periodSelectionSchema.safeParse({ period: 'custom', from: bad, to: '2026-08-13' }).success,
      ).toBe(false);
    }
  });

  it('rejects an unknown period', () => {
    expect(periodSelectionSchema.safeParse({ period: 'year' }).success).toBe(false);
  });
});

describe('officeRange', () => {
  it('starts at Moscow midnight of the first day', () => {
    const { since } = officeRange('2026-08-01', '2026-08-13');
    // In summer Moscow is UTC+3: midnight Aug 1 is 21:00 UTC the day before.
    expect(since.toISOString()).toBe('2026-07-31T21:00:00.000Z');
  });

  it('ends at the exclusive midnight of the day after `to`', () => {
    const { until } = officeRange('2026-08-01', '2026-08-13');
    expect(until.toISOString()).toBe('2026-08-13T21:00:00.000Z');
  });

  it('a single-day period covers exactly 24 hours', () => {
    const { since, until } = officeRange('2026-08-13', '2026-08-13');
    expect(until.getTime() - since.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('crosses month and year boundaries', () => {
    const { until } = officeRange('2026-12-31', '2026-12-31');
    expect(until.toISOString()).toBe('2026-12-31T21:00:00.000Z');
  });
});
