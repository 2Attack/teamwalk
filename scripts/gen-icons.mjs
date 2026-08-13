#!/usr/bin/env node
/**
 * Генератор иконочного набора CitrusWalk (п. 6.7.4 ТЗ: один набор, без иконочных
 * шрифтов).
 *
 * Источник — pixelarticons (https://pixelarticons.com, MIT, пакет `pixelarticons`):
 * готовые пиксельные иконки 24×24 на сетке 1×1. Раньше набор рисовался ASCII-матрицами
 * прямо в `gen-avatars.mjs` — свой велосипед на 14 иконок, который пришлось бы
 * дорисовывать при каждой новой кнопке.
 *
 * Что делает: собирает `lib/icons.generated.ts` — карту «имя → массив path d».
 * Данные инлайнятся в бандл, а не лежат в `/public`: иконка рендерится как <svg>
 * с `fill="currentColor"` и потому наследует цвет текста (у <img> currentColor
 * разрешается в чёрный — на тёмном фоне приложения иконки пропадали).
 *
 * Запуск: `npm run gen:icons`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'node_modules', 'pixelarticons', 'svg');
const OUT = join(ROOT, 'lib', 'icons.generated.ts');

/**
 * Имя в коде → файл pixelarticons.
 *
 * Слева — роль в интерфейсе, справа — файл набора: если для роли найдётся иконка
 * лучше, меняется одна строка, а не все места вызова.
 */
const MAP = {
  /** Серия дней подряд. */
  flame: 'fire',
  /** Личный рекорд, достижение и кубок на тумбе подиума. */
  trophy: 'trophy',
  /** Время, ожидание, «дорожка занята». */
  clock: 'clock',
  /** Реплика NPC в ленте хинтов. */
  hint: 'comment-text',
  /** Подтверждение. */
  check: 'check',
  /** Добавить участника; прибавить скорость на экране прогулки. */
  plus: 'plus',
  /** Сбросить скорость на экране прогулки. */
  minus: 'minus',
  /** Старт прогулки. */
  play: 'play',
  /** Завершение прогулки: флаг на финише, а не «стоп» — прогулку доводят до конца. */
  finish: 'flag',
  /** Ходьба: заголовок и пустые состояния. */
  walk: 'human-arms-down',
  /** Пункт достижения. */
  star: 'star',
  /** Дорожка на карте зала. */
  pin: 'map-pin',
  /** «Раскрыть список» — на триггере комбобокса участника. */
  chevronDown: 'chevron-down',
  /** Произвольный период рейтинга — на кнопке выбора диапазона дат. */
  calendar: 'calendar-range',
};

/** pixelarticons рисует иконку одним-двумя <path>; берём их в порядке следования. */
function extractPaths(file) {
  const svg = readFileSync(join(SRC, `${file}.svg`), 'utf8');
  const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  if (paths.length === 0) throw new Error(`В ${file}.svg не найдено ни одного <path d>`);
  return paths;
}

/** Все иконки набора — 24×24; смешивать сетки нельзя, иначе разъедется толщина штриха. */
function assertViewBox(file) {
  const svg = readFileSync(join(SRC, `${file}.svg`), 'utf8');
  if (!svg.includes('viewBox="0 0 24 24"')) {
    throw new Error(`${file}.svg не на сетке 24×24 — набор должен быть однородным`);
  }
}

const entries = Object.entries(MAP).map(([name, file]) => {
  assertViewBox(file);
  return [name, file, extractPaths(file)];
});

const body = entries
  .map(([name, file, paths]) => {
    const list = paths.map((d) => `\n    '${d}',`).join('');
    return `  /** pixelarticons: ${file} */\n  ${name}: [${list}\n  ],`;
  })
  .join('\n');

const out = `/**
 * СГЕНЕРИРОВАНО \`npm run gen:icons\` — руками не править.
 *
 * Иконки pixelarticons (https://pixelarticons.com), лицензия MIT.
 * Сетка 24×24, координаты целочисленные — см. \`components/ui/icon.tsx\`.
 */

/** Сетка всех иконок набора: на ней держится crispEdges-рендер. */
export const ICON_VIEWBOX = '0 0 24 24';

export const ICON_PATHS = {
${body}
} as const;

export type IconName = keyof typeof ICON_PATHS;
`;

writeFileSync(OUT, out, 'utf8');
console.log(`Иконки: ${entries.length} → lib/icons.generated.ts`);
