import { describe, expect, it } from 'vitest';

import { rejectReason } from '../lib/hints/filter';
import {
  autocloseText,
  digestText,
  farewellText,
  finishText,
  freeText,
  helpText,
  relinkedText,
  remindText,
  staleTokenText,
  startText,
  welcomeText,
} from '../lib/telegram/texts';

/**
 * Тексты Telegram-уведомлений (п. 6.10.4 ТЗ). Внутри генераторов — случайный
 * выбор шаблона, поэтому каждое свойство проверяется на серии вызовов: один
 * «удачный» прогон ничего не гарантирует.
 *
 * Ключевой инвариант — тот же постфильтр, что у хинтов (п. 6.6.4): темы тела,
 * веса, еды и здоровья в личку не попадают ни в одном варианте шаблона.
 * `isSafe` дополнительно режет строки длиннее 160 символов, а сообщение
 * может быть многострочным (финиш с ачивками) — поэтому фильтр гоняем
 * построчно, а общий лимит в 400 символов проверяем на целом тексте.
 */

const RUNS = 20;

/** Каждая непустая строка обязана проходить постфильтр хинтов. */
function expectSafeLines(text: string): void {
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue;
    expect(rejectReason(line), `строка не прошла постфильтр: «${line}»`).toBeNull();
  }
}

/** Общие свойства любого сообщения: непустое, без плейсхолдеров, ≤ 400, безопасное. */
function expectWellFormed(text: string): void {
  expect(text.trim().length).toBeGreaterThan(0);
  expect(text, `недоподставленный плейсхолдер в «${text}»`).not.toContain('{{');
  expect(text).not.toContain('}}');
  expect(text.length).toBeLessThanOrEqual(400);
  expectSafeLines(text);
}

describe('startText', () => {
  it('все варианты безопасны и корректны на разных скоростях', () => {
    const speeds = [1, 2.5, 4, 6.5];
    for (let i = 0; i < RUNS; i += 1) {
      const text = startText({
        speedKmh: speeds[i % speeds.length],
        treadmillName: 'Дорожка у окна',
      });
      expectWellFormed(text);
    }
  });
});

describe('finishText', () => {
  /** Репрезентативные комбинации: серия 0/6, ачивки есть/нет, место выросло/без прошлого. */
  const inputs = [
    {
      distanceKm: 2.1,
      durationSec: 1860,
      avgSpeedKmh: 4.1,
      streakDays: 0,
      rankCurrent: 5,
      rankPrevious: null,
      achievements: [] as string[],
    },
    {
      distanceKm: 2.1,
      durationSec: 1860,
      avgSpeedKmh: 4.1,
      streakDays: 6,
      rankCurrent: 2,
      rankPrevious: 3,
      achievements: ['Ранняя пташка'],
    },
    {
      distanceKm: 0.5,
      durationSec: 420,
      avgSpeedKmh: 4.3,
      streakDays: 1,
      rankCurrent: 7,
      rankPrevious: 7,
      achievements: ['Ранняя пташка', 'Марафонец'],
    },
    {
      distanceKm: 10,
      durationSec: 7200,
      avgSpeedKmh: 5,
      streakDays: 6,
      rankCurrent: 1,
      rankPrevious: null,
      achievements: [],
    },
  ];

  it('все варианты безопасны и корректны', () => {
    for (let i = 0; i < RUNS; i += 1) {
      expectWellFormed(finishText(inputs[i % inputs.length]));
    }
  });

  it('содержит форматированную дистанцию', () => {
    for (let i = 0; i < RUNS; i += 1) {
      expect(finishText(inputs[1])).toContain('2.1');
    }
  });
});

describe('autocloseText', () => {
  it('все варианты безопасны и корректны', () => {
    for (let i = 0; i < RUNS; i += 1) {
      expectWellFormed(autocloseText());
    }
  });
});

describe('freeText', () => {
  it('все варианты безопасны на разных длительностях занятости', () => {
    const busySecs = [0, 40, 60 * 40, 3600, 3600 + 60 * 20, 8 * 3600];
    for (let i = 0; i < RUNS; i += 1) {
      const text = freeText({
        treadmillName: 'Дорожка у окна',
        busySec: busySecs[i % busySecs.length],
      });
      expectWellFormed(text);
      expect(text).toContain('Дорожка у окна');
    }
  });

  it('занятость меньше минуты не упоминается, длинная — в часах', () => {
    for (let i = 0; i < RUNS; i += 1) {
      // 40 секунд: фразы про занятость нет вовсе (отмена случайного старта).
      expect(freeText({ treadmillName: 'Т', busySec: 40 })).not.toContain('занята');
      // 40 минут — минутами, 8 часов — часами, не «480 минут».
      expect(freeText({ treadmillName: 'Т', busySec: 60 * 40 })).toContain('40 минут');
      const long = freeText({ treadmillName: 'Т', busySec: 8 * 3600 });
      expect(long).toContain('8 часов');
      expect(long).not.toContain('480');
    }
  });
});

describe('remindText', () => {
  it('все варианты безопасны при разных сериях и заморозках', () => {
    const inputs = [
      { idleWorkdays: 2, streakDays: 0, freezesLeft: 2 },
      { idleWorkdays: 2, streakDays: 6, freezesLeft: 1 },
      { idleWorkdays: 5, streakDays: 6, freezesLeft: 0 },
      { idleWorkdays: 3, streakDays: 0, freezesLeft: 0 },
    ];
    for (let i = 0; i < RUNS; i += 1) {
      expectWellFormed(remindText(inputs[i % inputs.length]));
    }
  });

  it('при живой серии даёт конкретный повод — упоминает серию (п. 6.10.4)', () => {
    // Шаблон выбирается случайно; достаточно, чтобы серия упоминалась хотя бы
    // в одном из 30 прогонов — иначе повод «серия под угрозой» потерян вовсе.
    const texts = Array.from({ length: 30 }, () =>
      remindText({ idleWorkdays: 2, streakDays: 6, freezesLeft: 1 }),
    );
    expect(texts.some((text) => text.toLowerCase().includes('ери'))).toBe(true);
  });
});

describe('digestText', () => {
  const input = {
    weekKm: 38.2,
    passedCity: 'Кострома',
    top: [
      { name: 'Аня', km: 12.4 },
      { name: 'Егор', km: 9.1 },
      { name: 'Маша', km: 7.7 },
    ],
    selfRank: 5 as number | null,
    selfKm: 6.2,
  };

  it('все варианты безопасны, включая участника без места в топе', () => {
    for (let i = 0; i < RUNS; i += 1) {
      expectWellFormed(digestText(input));
      expectWellFormed(digestText({ ...input, selfRank: null, selfKm: 0 }));
    }
  });

  it('содержит имена из топа и пройденный город', () => {
    for (let i = 0; i < RUNS; i += 1) {
      const text = digestText(input);
      expect(text).toContain('Аня');
      expect(text).toContain('Егор');
      expect(text).toContain('Маша');
      expect(text).toContain('Кострома');
    }
  });
});

describe('welcomeText / relinkedText', () => {
  it('welcomeText безопасен и обращается по имени', () => {
    for (let i = 0; i < RUNS; i += 1) {
      const text = welcomeText('Егор');
      expectWellFormed(text);
      expect(text).toContain('Егор');
    }
  });

  it('relinkedText безопасен и обращается по имени', () => {
    for (let i = 0; i < RUNS; i += 1) {
      const text = relinkedText('Маша');
      expectWellFormed(text);
      expect(text).toContain('Маша');
    }
  });
});

describe('служебные тексты', () => {
  it('helpText безопасен и корректен', () => {
    for (let i = 0; i < RUNS; i += 1) {
      expectWellFormed(helpText());
    }
  });

  it('farewellText безопасен и корректен', () => {
    for (let i = 0; i < RUNS; i += 1) {
      expectWellFormed(farewellText());
    }
  });

  it('staleTokenText безопасен и корректен', () => {
    for (let i = 0; i < RUNS; i += 1) {
      expectWellFormed(staleTokenText());
    }
  });
});
