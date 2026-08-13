import { describe, expect, it } from 'vitest';

import { officeRange } from '../lib/time';
import { periodSelectionSchema } from '../lib/validation';

describe('periodSelectionSchema', () => {
  it('принимает предустановленные периоды', () => {
    for (const period of ['week', 'month', 'all'] as const) {
      expect(periodSelectionSchema.parse({ period })).toEqual({ period });
    }
  });

  it('по умолчанию — неделя', () => {
    expect(periodSelectionSchema.parse({ period: undefined })).toEqual({ period: 'week' });
  });

  it('принимает произвольный период с корректными границами', () => {
    const parsed = periodSelectionSchema.parse({
      period: 'custom',
      from: '2026-08-01',
      to: '2026-08-13',
    });
    expect(parsed).toEqual({ period: 'custom', from: '2026-08-01', to: '2026-08-13' });
  });

  it('принимает период из одного дня', () => {
    expect(
      periodSelectionSchema.safeParse({ period: 'custom', from: '2026-08-13', to: '2026-08-13' })
        .success,
    ).toBe(true);
  });

  it('отклоняет custom без границ', () => {
    expect(periodSelectionSchema.safeParse({ period: 'custom' }).success).toBe(false);
    expect(
      periodSelectionSchema.safeParse({ period: 'custom', from: '2026-08-01' }).success,
    ).toBe(false);
  });

  it('отклоняет начало позже конца', () => {
    expect(
      periodSelectionSchema.safeParse({ period: 'custom', from: '2026-08-13', to: '2026-08-01' })
        .success,
    ).toBe(false);
  });

  it('отклоняет мусор вместо даты и несуществующие даты', () => {
    for (const bad of ['13.08.2026', '2026-8-1', 'вчера', '2026-02-31']) {
      expect(
        periodSelectionSchema.safeParse({ period: 'custom', from: bad, to: '2026-08-13' }).success,
      ).toBe(false);
    }
  });

  it('отклоняет неизвестный период', () => {
    expect(periodSelectionSchema.safeParse({ period: 'year' }).success).toBe(false);
  });
});

describe('officeRange', () => {
  it('старт — московская полночь первого дня', () => {
    const { since } = officeRange('2026-08-01', '2026-08-13');
    // Летом Москва — UTC+3: полночь 1 августа это 21:00 UTC накануне.
    expect(since.toISOString()).toBe('2026-07-31T21:00:00.000Z');
  });

  it('конец — эксклюзивная полночь дня после `to`', () => {
    const { until } = officeRange('2026-08-01', '2026-08-13');
    expect(until.toISOString()).toBe('2026-08-13T21:00:00.000Z');
  });

  it('период из одного дня покрывает ровно сутки', () => {
    const { since, until } = officeRange('2026-08-13', '2026-08-13');
    expect(until.getTime() - since.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('перескакивает границу месяца и года', () => {
    const { until } = officeRange('2026-12-31', '2026-12-31');
    expect(until.toISOString()).toBe('2026-12-31T21:00:00.000Z');
  });
});
