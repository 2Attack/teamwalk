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

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
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

/**
 * Самодельные иконки — `scripts/icons/*.svg`: та же сетка 24×24 и блочный
 * стиль, что у pixelarticons, но нарисованы под конкретные роли (ачивки,
 * п. 6.8.3). Имя в коде — camelCase от имени файла. Исходники лежат рядом
 * со скриптом, итог всё равно попадает только в сгенерированный файл.
 */
const CUSTOM_DIR = join(ROOT, 'scripts', 'icons');

/** pixelarticons рисует иконку одним-двумя <path>; берём их в порядке следования. */
function extractPaths(svgText, label) {
  const paths = [...svgText.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  if (paths.length === 0) throw new Error(`В ${label} не найдено ни одного <path d>`);
  return paths;
}

/** Все иконки набора — 24×24; смешивать сетки нельзя, иначе разъедется толщина штриха. */
function assertViewBox(svgText, label) {
  if (!svgText.includes('viewBox="0 0 24 24"')) {
    throw new Error(`${label} не на сетке 24×24 — набор должен быть однородным`);
  }
}

const entries = Object.entries(MAP).map(([name, file]) => {
  const svg = readFileSync(join(SRC, `${file}.svg`), 'utf8');
  assertViewBox(svg, `${file}.svg`);
  return [name, `pixelarticons: ${file}`, extractPaths(svg, `${file}.svg`)];
});

for (const file of readdirSync(CUSTOM_DIR).filter((f) => f.endsWith('.svg')).sort()) {
  const name = file.replace(/\.svg$/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const svg = readFileSync(join(CUSTOM_DIR, file), 'utf8');
  assertViewBox(svg, `scripts/icons/${file}`);
  entries.push([name, `свой, scripts/icons/${file}`, extractPaths(svg, `scripts/icons/${file}`)]);
}

const body = entries
  .map(([name, source, paths]) => {
    const list = paths.map((d) => `\n    '${d}',`).join('');
    return `  /** ${source} */\n  ${name}: [${list}\n  ],`;
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
