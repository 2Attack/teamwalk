import { describe, expect, it } from 'vitest';

import { computeStreak } from '../lib/game/streak';

/**
 * Календарь августа 2026 (для наглядности кейсов):
 * пн 03, вт 04, ср 05, чт 06, пт 07 | сб 08, вс 09 |
 * пн 10, вт 11, ср 12, чт 13, пт 14 | сб 15, вс 16 | пн 17, вт 18 …
 */
const LIMIT = 2;

describe('computeStreak', () => {
  it('пустая история — серии нет, заморозки нетронуты', () => {
    const result = computeStreak([], '2026-08-13', [], LIMIT);
    expect(result).toEqual({ days: 0, frozen: false, freezesLeft: 2, freezesToUse: [] });
  });

  it('считает подряд идущие рабочие дни, включая сегодняшний', () => {
    const result = computeStreak(
      ['2026-08-11', '2026-08-12', '2026-08-13'],
      '2026-08-13',
      [],
      LIMIT,
    );
    expect(result.days).toBe(3);
    expect(result.frozen).toBe(false);
  });

  it('вчера ходил, сегодня ещё нет — серия жива и заморозка не тратится', () => {
    const result = computeStreak(['2026-08-11', '2026-08-12'], '2026-08-13', [], LIMIT);
    expect(result.days).toBe(2);
    expect(result.freezesToUse).toEqual([]);
    expect(result.freezesLeft).toBe(2);
  });

  it('выходные не разрывают серию: пятница + понедельник = 2 дня', () => {
    const result = computeStreak(['2026-08-07', '2026-08-10'], '2026-08-10', [], LIMIT);
    expect(result.days).toBe(2);
    expect(result.frozen).toBe(false);
  });

  it('выходные не увеличивают серию: прогулка в субботу не считается', () => {
    const result = computeStreak(
      ['2026-08-07', '2026-08-08', '2026-08-10'],
      '2026-08-10',
      [],
      LIMIT,
    );
    expect(result.days).toBe(2);
  });

  it('сегодня выходной — серия считается по последнему рабочему дню', () => {
    // Суббота 15-го: серия чт+пт остаётся видимой и не требует заморозок.
    const result = computeStreak(['2026-08-13', '2026-08-14'], '2026-08-15', [], LIMIT);
    expect(result.days).toBe(2);
    expect(result.freezesToUse).toEqual([]);
  });

  it('один пропущенный рабочий день гасится заморозкой', () => {
    // Пропущена среда 12-го, серия вт → чт не рвётся.
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

  it('два пропуска за месяц гасятся двумя заморозками, лимит исчерпан', () => {
    // Пропущены ср 12 и пн 10, серия вт 11 → чт 13 → … → пт 07.
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

  it('третий пропуск за месяц сбрасывает серию', () => {
    // Пропущены ср 12, пн 10 и пт 07 — на третий заморозок уже нет, серия обрывается
    // на 11-м. Заморозка за 10-е при этом не тратится: спасать ей уже нечего.
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

  it('уже израсходованная заморозка учитывается в бюджете месяца', () => {
    // 05-е погашено раньше, поэтому на пропуск 10-го бюджета уже не хватает.
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

  it('повторный расчёт не тратит заморозку дважды', () => {
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

  it('лимит заморозок — на календарный месяц, прошлый месяц бюджет не съедает', () => {
    // Пропуск 31 июля гасится июльской заморозкой, июльские траты не мешают августу.
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

  it('заморозка не тратится, если спасать нечего', () => {
    // Единственная прогулка — сегодня; более ранних дней нет, пропуски гасить незачем.
    const result = computeStreak(['2026-08-13'], '2026-08-13', [], LIMIT);
    expect(result.days).toBe(1);
    expect(result.frozen).toBe(false);
    expect(result.freezesToUse).toEqual([]);
    expect(result.freezesLeft).toBe(2);
  });

  it('без заморозок любой пропуск сбрасывает серию до нуля', () => {
    const result = computeStreak(['2026-08-11'], '2026-08-13', [], 0);
    expect(result.days).toBe(0);
    expect(result.freezesToUse).toEqual([]);
    expect(result.freezesLeft).toBe(0);
  });

  it('давняя серия без прогулок на этой неделе не воскресает', () => {
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
