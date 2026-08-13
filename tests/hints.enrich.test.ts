import { describe, expect, it } from 'vitest';

import { catchupDays, nextMilestone, rankChanges } from '@/lib/hints/enrich';

describe('nextMilestone', () => {
  it('целится в ближайшую сотню', () => {
    expect(nextMilestone(488)).toEqual({ at: 500, left: 12 });
    expect(nextMilestone(12.5)).toEqual({ at: 100, left: 87.5 });
  });

  it('на нуле и ровно на рубеже смотрит вперёд, а не в «осталось 0»', () => {
    expect(nextMilestone(0)).toEqual({ at: 100, left: 100 });
    expect(nextMilestone(500)).toEqual({ at: 600, left: 100 });
  });

  it('округляет остаток до сотых', () => {
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

  it('обгон за неделю даёт +1 обогнавшему и −1 обогнанному', () => {
    // Неделю назад: a=10, b=8. Сейчас: a=11, b=14 — b перепрыгнул a.
    const changes = rankChanges([user('a', 11, 1), user('b', 14, 6)]);
    expect(changes.get('b')).toBe(1);
    expect(changes.get('a')).toBe(-1);
  });

  it('без прогулок за неделю все на своих местах', () => {
    const changes = rankChanges([user('a', 10, 0), user('b', 5, 0)]);
    expect(changes.get('a')).toBe(0);
    expect(changes.get('b')).toBe(0);
  });

  it('тай-брейк по имени совпадает с рейтингом и не даёт ложных скачков', () => {
    // Равные тоталы всю неделю: порядок стабилен, изменения нулевые.
    const changes = rankChanges([user('b', 10, 0), user('a', 10, 0)]);
    expect(changes.get('a')).toBe(0);
    expect(changes.get('b')).toBe(0);
  });
});

describe('catchupDays', () => {
  it('считает дни по разнице недельных темпов', () => {
    // Догоняющий делает на 5 км/нед больше → +1 км за рабочий день; разрыв 3 км.
    expect(catchupDays(3, 10, 5)).toBe(3);
  });

  it('округляет вверх — «догонит через 2.1 дня» не бывает', () => {
    expect(catchupDays(2.1, 10, 5)).toBe(3);
  });

  it('не догоняет при равном или худшем темпе', () => {
    expect(catchupDays(3, 5, 5)).toBeNull();
    expect(catchupDays(3, 4, 5)).toBeNull();
  });

  it('слишком дальний прогноз отбрасывает', () => {
    expect(catchupDays(100, 6, 5)).toBeNull();
  });

  it('нулевой или отрицательный разрыв — не сюжет', () => {
    expect(catchupDays(0, 10, 5)).toBeNull();
  });
});
