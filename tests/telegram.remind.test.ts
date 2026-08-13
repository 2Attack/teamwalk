import { describe, expect, it } from 'vitest';

import { reminderDecision, type ReminderFacts } from '../lib/telegram/remind-rules';
import { workdaysSince } from '../lib/time';

/**
 * Правила напоминаний «пора размяться» (п. 6.10.4 ТЗ). Здесь проверяется только
 * решение «слать / не слать» по фактам; окно отправки (день недели, час) —
 * зона планировщика и в `reminderDecision` намеренно не входит.
 *
 * Календарь августа 2026 (тот же, что в streak.test.ts):
 * пн 03, вт 04, ср 05, чт 06, пт 07 | сб 08, вс 09 |
 * пн 10, вт 11, ср 12, чт 13, пт 14 | сб 15, вс 16 | пн 17, вт 18 …
 */

/** База: давний участник, последняя прогулка в пятницу, напоминаний ещё не было. */
const BASE: ReminderFacts = {
  today: '2026-08-13', // четверг
  userCreatedDay: '2026-07-01',
  lastWalkDay: '2026-08-07', // пятница — простой к четвергу: пн+вт+ср = 3 полных дня
  linkedDay: '2026-07-01',
  lastRemindDay: null,
  remindsSinceWalk: 0,
};

function facts(overrides: Partial<ReminderFacts>): ReminderFacts {
  return { ...BASE, ...overrides };
}

describe('reminderDecision: новички', () => {
  it('участник моложе 3 дней не напоминается даже при большом простое', () => {
    // Создан во вторник 11-го, сегодня четверг 13-е: diffOfficeDays = 2 < 3.
    // Прогулка была давно — простой огромный, но новичок ещё ничего не «забросил».
    const result = reminderDecision(
      facts({ userCreatedDay: '2026-08-11', lastWalkDay: '2026-08-03' }),
    );
    expect(result).toBe(false);
  });

  it('ровно 3 календарных дня с создания — уже не новичок', () => {
    // Создан в понедельник 10-го: diffOfficeDays('2026-08-13', '2026-08-10') = 3.
    const result = reminderDecision(
      facts({ userCreatedDay: '2026-08-10', lastWalkDay: '2026-08-03' }),
    );
    expect(result).toBe(true);
  });
});

describe('reminderDecision: простой в рабочих днях', () => {
  it('ходил вчера (рабочий день) — 0 полных дней простоя, не напоминаем', () => {
    expect(reminderDecision(facts({ lastWalkDay: '2026-08-12' }))).toBe(false);
  });

  it('ходил сегодня — тем более не напоминаем', () => {
    expect(reminderDecision(facts({ lastWalkDay: '2026-08-13' }))).toBe(false);
  });

  it('пятница → вторник: пропущен только понедельник, 1 < 2 — рано', () => {
    expect(
      reminderDecision(facts({ lastWalkDay: '2026-08-07', today: '2026-08-11' })),
    ).toBe(false);
  });

  it('пятница → среда: пропущены пн и вт, 2 полных дня — пора', () => {
    expect(
      reminderDecision(facts({ lastWalkDay: '2026-08-07', today: '2026-08-12' })),
    ).toBe(true);
  });

  it('выходные не считаются: четверг → понедельник — пропущена одна пятница', () => {
    expect(
      reminderDecision(facts({ lastWalkDay: '2026-08-06', today: '2026-08-10' })),
    ).toBe(false);
  });

  it('четверг → вторник: пропущены пт и пн — пора', () => {
    expect(
      reminderDecision(facts({ lastWalkDay: '2026-08-06', today: '2026-08-11' })),
    ).toBe(true);
  });

  it('сегодня суббота — «сегодня» из простоя не вычитается', () => {
    // Прогулка в среду 12-го, сегодня суббота 15-е: полных пропущено чт+пт = 2.
    // Окно (не слать в выходной) проверяется не здесь — решение по фактам «пора».
    expect(
      reminderDecision(facts({ lastWalkDay: '2026-08-12', today: '2026-08-15' })),
    ).toBe(true);
  });
});

describe('reminderDecision: никогда не ходил — база linkedDay', () => {
  it('привязался в пятницу, сегодня четверг: простой 3 дня — пора', () => {
    expect(
      reminderDecision(facts({ lastWalkDay: null, linkedDay: '2026-08-07' })),
    ).toBe(true);
  });

  it('привязался во вторник, сегодня четверг: пропущена одна среда — рано', () => {
    expect(
      reminderDecision(facts({ lastWalkDay: null, linkedDay: '2026-08-11' })),
    ).toBe(false);
  });
});

describe('reminderDecision: кулдаун между напоминаниями', () => {
  it('напоминание было вчера (1 рабочий день назад) — молчим', () => {
    const result = reminderDecision(
      facts({ lastWalkDay: '2026-08-05', lastRemindDay: '2026-08-12', remindsSinceWalk: 1 }),
    );
    expect(result).toBe(false);
  });

  it('напоминание было 2 рабочих дня назад — ещё молчим', () => {
    const result = reminderDecision(
      facts({ lastWalkDay: '2026-08-05', lastRemindDay: '2026-08-11', remindsSinceWalk: 1 }),
    );
    expect(result).toBe(false);
  });

  it('ровно 3 рабочих дня назад — кулдаун истёк, можно', () => {
    const result = reminderDecision(
      facts({ lastWalkDay: '2026-08-05', lastRemindDay: '2026-08-10', remindsSinceWalk: 1 }),
    );
    expect(result).toBe(true);
  });

  it('кулдаун считается рабочими днями: пятница → среда это ровно 3', () => {
    // Пятница 07 → среда 12: пн+вт+ср = 3 рабочих дня, суббота и воскресенье не в счёт.
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

describe('reminderDecision: затухание и тишина', () => {
  it('после 3 напоминаний кулдаун растёт до 5: 3 рабочих дня — мало', () => {
    const result = reminderDecision(
      facts({ lastWalkDay: '2026-07-27', lastRemindDay: '2026-08-10', remindsSinceWalk: 3 }),
    );
    expect(result).toBe(false);
  });

  it('после 3 напоминаний: 5 рабочих дней с последнего — можно', () => {
    // Четверг 06 → четверг 13: пт 07, пн 10, вт 11, ср 12, чт 13 = 5.
    const result = reminderDecision(
      facts({ lastWalkDay: '2026-07-27', lastRemindDay: '2026-08-06', remindsSinceWalk: 3 }),
    );
    expect(result).toBe(true);
  });

  it('2 напоминания — бэкофф ещё не включён, хватает обычных 3 дней', () => {
    const result = reminderDecision(
      facts({ lastWalkDay: '2026-07-27', lastRemindDay: '2026-08-10', remindsSinceWalk: 2 }),
    );
    expect(result).toBe(true);
  });

  it('5 напоминаний — всё ещё бэкофф, 5 рабочих дней достаточно', () => {
    const result = reminderDecision(
      facts({ lastWalkDay: '2026-07-27', lastRemindDay: '2026-08-06', remindsSinceWalk: 5 }),
    );
    expect(result).toBe(true);
  });

  it('после 6 напоминаний — тишина, каким бы давним ни было последнее', () => {
    const result = reminderDecision(
      facts({ lastWalkDay: '2026-07-01', lastRemindDay: '2026-07-15', remindsSinceWalk: 6 }),
    );
    expect(result).toBe(false);
  });

  it('7 напоминаний — тоже тишина (порог «не меньше 6»)', () => {
    const result = reminderDecision(
      facts({ lastWalkDay: '2026-07-01', lastRemindDay: null, remindsSinceWalk: 7 }),
    );
    expect(result).toBe(false);
  });
});

describe('reminderDecision: чистый случай', () => {
  it('простой достаточный, напоминаний не было — шлём', () => {
    expect(
      reminderDecision(facts({ lastRemindDay: null, remindsSinceWalk: 0 })),
    ).toBe(true);
  });
});

describe('workdaysSince: контракт полуинтервала (from; to]', () => {
  it('from === to → 0: день события в интервал не входит', () => {
    expect(workdaysSince('2026-08-13', '2026-08-13')).toBe(0);
  });

  it('соседние рабочие дни → 1: правая граница включается, левая нет', () => {
    expect(workdaysSince('2026-08-12', '2026-08-13')).toBe(1);
  });

  it('выходные пропускаются: пятница → понедельник = 1', () => {
    expect(workdaysSince('2026-08-07', '2026-08-10')).toBe(1);
  });

  it('интервал через выходные: четверг 06 → вторник 11 = 3 (пт, пн, вт)', () => {
    expect(workdaysSince('2026-08-06', '2026-08-11')).toBe(3);
  });
});
