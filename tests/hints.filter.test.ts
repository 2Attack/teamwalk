import { afterEach, describe, expect, it, vi } from 'vitest';

import { MAX_HINT_LENGTH, isSafe, rejectReason } from '@/lib/hints/filter';
import { STATIC_HINTS } from '@/lib/hints/registry';

/**
 * The post-filter is the only tone guarantee (spec 6.6.4, acceptance in 12).
 * Tests hold both boundaries: known-bad phrases must not pass, while normal
 * walking jokes must not be rejected "just in case".
 *
 * The default test locale is ru (no NEXT_PUBLIC_LOCALE in the test env), so
 * the main suites exercise the Russian rules; en/es rules are loaded via
 * `vi.stubEnv` + `vi.resetModules` in a dedicated suite below.
 */

/** Known-bad phrases: [text, expected reason category]. */
const BAD: ReadonlyArray<readonly [string, string]> = [
  ['{{u1}} за неделю не сделал ни шага, наверное, прибавил 20 кг', 'banned:вес'],
  ['{{u1}} похудел на 5 килограмм за месяц ходьбы', 'banned:вес'],
  ['{{u1}} мерит вес каждое утро после дорожки', 'banned:вес'],
  ['{{u1}} разъелся за отпуск и вернулся к дорожке', 'banned:тело'],
  ['Никакая диета не заменит 5 км в день', 'banned:еда'],
  ['{{u1}} следит за фигурой лучше, чем за рейтингом', 'banned:тело'],
  ['У {{u1}} живот больше, чем беговая дорожка', 'banned:тело'],
  ['Сколько калорий {{u1}} сжёг за эту неделю', 'banned:еда'],
  ['Ходьба полезна для здоровья, проверено', 'banned:здоровье'],
  ['{{u1}} болеет вторую неделю и не выходит на дорожку', 'banned:здоровье'],
  ['Пульс {{u1}} на 6 км/ч зашкаливает', 'banned:здоровье'],
  ['Врач советует {{u1}} ходить больше', 'banned:здоровье'],
  ['В его возрасте 5 км — это подвиг', 'banned:возраст'],
  ['{{u1}} тратит зарплату на кроссовки, а не на дорожку', 'banned:деньги'],
  ['{{u1}} после развода ходит заметно чаще', 'banned:личное'],
  ['{{u1}} — жирный лентяй, кресло победило', 'banned:тело'],
  ['{{u1}}, блядь, опять не пришёл на дорожку', 'banned:мат'],
  ['{{u1}} тупой, раз ходит на 3 км/ч', 'banned:оскорбление'],
  ['{{u1}} толстеет прямо на глазах у дорожки', 'banned:вес'],
  ['{{u1}} ест на ходу и всё равно первый', 'banned:еда'],
];

/** Normal phrases: jokes about walking, the treadmill, the chair and stats. */
const GOOD: readonly string[] = [
  '{{u1}} прошёл 20 км, ни разу не сдвинувшись с места. У физики вопросы.',
  '{{u1}} на этой неделе прошёл 0 км. Кресло победило со счётом 1:0.',
  'Средняя скорость команды — 3.8 км/ч. У черепахи 0.27. Мы выигрываем.',
  '{{u2}} отстаёт от {{u1}} на 3.4 км. Это 50 минут ходьбы. Просто говорим.',
  '{{u1}} последний раз выходил на дорожку 9 дней назад. Дорожка начала забывать его имя.',
  '{{u1}} держит серию 4 дня подряд. Дорожка уже здоровается по имени.',
  '3–4 км/ч не мешают говорить на созвоне. Проверено коллегами.',
  'Команда прошла 310 км и дошла до Москвы. Следующая остановка — Смоленск.',
  '{{u1}} провёл на дорожке 7 ч. Это 14 серий сериала, которые он не посмотрел.',
  'Вводи дистанцию сразу после прогулки: через час ты её не вспомнишь.',
  '{{u1}} ни разу не переключал скорость с 4 км/ч. Уважение к стабильности.',
  'Сегодня на дорожке ещё никого не было. Она стоит и смотрит на вас.',
  '{{u1}} только что обошёл {{u2}} и поднялся на 2 место.',
  'До экватора команде осталось 190 км. Не расслабляемся.',
  '{{u1}} держит уверенное последнее место. Это тоже стабильность.',
];

describe('rejectReason: запрещённые темы', () => {
  it.each(BAD)('отклоняет «%s»', (text, reason) => {
    expect(rejectReason(text)).toBe(reason);
    expect(isSafe(text)).toBe(false);
  });

  it('отклоняет все плохие фразы без исключений', () => {
    expect(BAD.filter(([text]) => isSafe(text))).toEqual([]);
  });
});

describe('rejectReason: нормальные фразы', () => {
  it.each(GOOD)('пропускает «%s»', (text) => {
    expect(rejectReason(text)).toBeNull();
  });

  it('«прошёл 20 км» не ловится как «прибавил 20 кг»', () => {
    expect(isSafe('{{u1}} прошёл 20 км за неделю')).toBe(true);
    expect(isSafe('{{u1}} прибавил 20 кг за неделю')).toBe(false);
  });

  it('«здоровается» не ловится как «здоровье»', () => {
    expect(isSafe('Дорожка здоровается с {{u1}} по имени')).toBe(true);
    expect(isSafe('{{u1}} бережёт здоровье')).toBe(false);
  });

  it('«весело», «весь» и «вести» не ловятся как «вес»', () => {
    expect(isSafe('Весь отдел вышел на дорожку, и это было весело')).toBe(true);
  });
});

describe('статический каталог', () => {
  // The catalog is the last degradation line: if the filter rejects it,
  // the pool can end up empty at the worst possible moment.
  it.each(STATIC_HINTS.map((hint) => hint.text))('фраза каталога проходит фильтр: «%s»', (text) => {
    expect(rejectReason(text)).toBeNull();
  });
});

describe('en/es locales', () => {
  // The locale is fixed at module load, so each case stubs the env and
  // re-imports the modules. Static top-level imports above stay bound to the
  // default ru locale and are unaffected.
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadLocale(locale: 'en' | 'es') {
    vi.stubEnv('NEXT_PUBLIC_LOCALE', locale);
    vi.resetModules();
    const filter = await import('@/lib/hints/filter');
    const registry = await import('@/lib/hints/registry');
    return { ...filter, staticHints: registry.STATIC_HINTS };
  }

  it('en: banned topics are rejected with English categories', async () => {
    const { rejectReason: reject } = await loadLocale('en');
    expect(reject('{{u1}} probably gained 20 kg this week')).toBe('banned:weight');
    expect(reject('No diet beats 5 km a day')).toBe('banned:food');
    expect(reject('Walking is good for your health')).toBe('banned:health');
    expect(reject('At their age 5 km is quite the feat')).toBe('banned:age');
    expect(reject('{{u1}} is a loser stuck at 3 km/h')).toBe('banned:insult');
  });

  it('en: normal walking jokes pass', async () => {
    const { isSafe: safe } = await loadLocale('en');
    expect(safe('{{u1}} walked 20 km without leaving the office. Physics has questions.')).toBe(true);
    expect(safe('The treadmill greets {{u1}} by name now')).toBe(true);
    expect(safe('Music at 120 beats per minute sets a steady stride')).toBe(true);
  });

  it('en: the full static catalog passes the English rules', async () => {
    const { rejectReason: reject, staticHints } = await loadLocale('en');
    expect(staticHints.filter((hint) => reject(hint.text) !== null)).toEqual([]);
  });

  it('es: banned topics are rejected, diacritics do not bypass the filter', async () => {
    const { rejectReason: reject } = await loadLocale('es');
    expect(reject('{{u1}} engordó este mes en vez de caminar')).toBe('banned:weight');
    expect(reject('Ninguna dieta sustituye 5 km al día')).toBe('banned:food');
    expect(reject('Caminar es bueno para la salud')).toBe('banned:health');
    expect(reject('Ningún médico aprobaría este ritmo')).toBe('banned:health');
    expect(reject('{{u1}} es tonto por ir a 3 km/h')).toBe('banned:insult');
  });

  it('es: «saluda» (greets) is not caught as «salud» (health)', async () => {
    const { isSafe: safe } = await loadLocale('es');
    expect(safe('La cinta ya saluda a {{u1}} al llegar')).toBe(true);
    expect(safe('{{u1}} presume de salud tras el paseo')).toBe(false);
  });

  it('es: the full static catalog passes the Spanish rules', async () => {
    const { rejectReason: reject, staticHints } = await loadLocale('es');
    expect(staticHints.filter((hint) => reject(hint.text) !== null)).toEqual([]);
  });
});

describe('rejectReason: длина и плейсхолдеры', () => {
  it('отклоняет фразу длиннее лимита', () => {
    expect(rejectReason(`${'а'.repeat(MAX_HINT_LENGTH + 1)}`)).toBe('too_long');
  });

  it('пропускает фразу ровно по лимиту', () => {
    expect(rejectReason('а'.repeat(MAX_HINT_LENGTH))).toBeNull();
  });

  it('отклоняет пустую строку и пробелы', () => {
    expect(rejectReason('   ')).toBe('empty');
  });

  it('отклоняет незакрытый плейсхолдер', () => {
    expect(rejectReason('{{u1} отстаёт от {{u2}} на 3 км')).toBe('placeholder');
  });

  it('отклоняет чужой плейсхолдер', () => {
    expect(rejectReason('{name} прошёл 5 км')).toBe('placeholder');
  });

  it('пропускает корректные плейсхолдеры', () => {
    expect(rejectReason('{{u10}} обошёл {{u3}} на 0.5 км')).toBeNull();
  });
});
