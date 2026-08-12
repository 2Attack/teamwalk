import { describe, expect, it } from 'vitest';

import { calcDistanceKm, calcSegmentedDistanceKm, formatSpeedTrail } from '@/lib/format';

/** Дистанция при смене скорости на ходу (п. 6.3). */

const START = Date.parse('2026-08-12T09:00:00.000Z');
const min = (n: number) => START + n * 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe('calcSegmentedDistanceKm', () => {
  it('без смен скорости совпадает с расчётом по одной скорости', () => {
    const segments = [{ speedKmh: 4, startedAt: iso(START) }];

    expect(calcSegmentedDistanceKm(segments, min(30))).toBe(2);
    expect(calcSegmentedDistanceKm(segments, min(30))).toBe(calcDistanceKm(4, 30 * 60));
  });

  it('не переписывает прошлое: пройденное до смены считается по прежней скорости', () => {
    const segments = [
      { speedKmh: 6, startedAt: iso(START) }, // 10 мин × 6 = 1.00 км
      { speedKmh: 3, startedAt: iso(min(10)) }, // 10 мин × 3 = 0.50 км
    ];

    expect(calcSegmentedDistanceKm(segments, min(20))).toBe(1.5);
    // Сброс темпа не отнимает уже набежавшее: по одной последней скорости было бы 1.00.
    expect(calcSegmentedDistanceKm(segments, min(20))).toBeGreaterThan(calcDistanceKm(3, 20 * 60));
  });

  it('складывает несколько смен подряд', () => {
    const segments = [
      { speedKmh: 4, startedAt: iso(START) }, // 15 мин × 4 = 1.00
      { speedKmh: 5, startedAt: iso(min(15)) }, // 15 мин × 5 = 1.25
      { speedKmh: 6, startedAt: iso(min(30)) }, // 30 мин × 6 = 3.00
    ];

    expect(calcSegmentedDistanceKm(segments, min(60))).toBe(5.25);
  });

  it('в момент смены отрезок нулевой длины ничего не добавляет', () => {
    const segments = [
      { speedKmh: 4, startedAt: iso(START) },
      { speedKmh: 9, startedAt: iso(min(15)) },
    ];

    expect(calcSegmentedDistanceKm(segments, min(15))).toBe(1);
  });

  it('не уходит в минус, если конец раньше начала отрезка', () => {
    // Возможно только при рассинхроне часов клиента и сервера.
    const segments = [
      { speedKmh: 4, startedAt: iso(START) },
      { speedKmh: 9, startedAt: iso(min(20)) },
    ];

    expect(calcSegmentedDistanceKm(segments, min(10))).toBe(0.67);
  });

  it('пустой список даёт ноль, а не NaN', () => {
    expect(calcSegmentedDistanceKm([], min(10))).toBe(0);
  });

  it('округляет один раз в конце: десяток смен не накапливает ошибку', () => {
    // 10 отрезков по 1 минуте при 6 км/ч — ровно 1 км, хотя каждый по 0.1 км.
    const segments = Array.from({ length: 10 }, (_, i) => ({
      speedKmh: 6,
      startedAt: iso(min(i)),
    }));

    expect(calcSegmentedDistanceKm(segments, min(10))).toBe(1);
  });
});

describe('formatSpeedTrail', () => {
  it('одна скорость — обычная подпись', () => {
    expect(formatSpeedTrail([4])).toBe('4 км/ч');
  });

  it('несколько скоростей перечисляются в порядке смен', () => {
    expect(formatSpeedTrail([4, 6, 5])).toBe('4 → 6 → 5 км/ч');
  });

  it('длинная череда смен сворачивается: подпись остаётся в одну строку', () => {
    expect(formatSpeedTrail([4, 5, 6, 5, 4, 3])).toBe('4 → … → 3 км/ч');
  });
});
