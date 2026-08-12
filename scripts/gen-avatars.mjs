#!/usr/bin/env node
/**
 * Генератор статических пиксельных ассетов CitrusWalk (зона ASSETS, п. 6.5 и 6.7 ТЗ).
 *
 * Что делает:
 *   1. `public/avatars/pixel-01..24.svg` — 24 портрета DiceBear, стиль `pixel-art`.
 *   2. `public/sprites/walk.svg` — спрайтшит 256×32: 8 кадров цикла ходьбы по 32×32.
 *
 * Сетевых запросов нет и в рантайме их тоже не появляется: DiceBear работает
 * локальным пакетом на этапе генерации, результат коммитится как статика.
 * Спрайт по-прежнему описан матрицами и палитрами прямо здесь.
 * Иконки живут отдельно — см. `scripts/gen-icons.mjs`.
 * Запуск: `npm run gen:assets`.
 */

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pixelArt } from '@dicebear/collection';
import { createAvatar } from '@dicebear/core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

/* ------------------------------------------------------------------ */
/* Общие утилиты работы с пиксельной сеткой                            */
/* ------------------------------------------------------------------ */

/** Сетка — массив массивов символов; '.' означает прозрачный пиксель. */
const gridFromRows = (rows) => rows.map((r) => r.split(''));

const emptyGrid = (w, h) =>
  Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));

const set = (g, x, y, ch) => {
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = ch;
};

const fill = (g, x0, y0, x1, y1, ch) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(g, x, y, ch);
};

const pxs = (g, list, ch) => list.forEach(([x, y]) => set(g, x, y, ch));

/** Проверка целостности сетки — ловит опечатки в ASCII-матрицах. */
function assertGrid(g, w, h, name) {
  if (g.length !== h) throw new Error(`${name}: строк ${g.length}, ожидалось ${h}`);
  g.forEach((row, y) => {
    if (row.length !== w) throw new Error(`${name}: строка ${y} длиной ${row.length}, ожидалось ${w}`);
  });
}

/* ------------------------------------------------------------------ */
/* Сериализация в SVG                                                  */
/* ------------------------------------------------------------------ */

/** Каждый пиксель — отдельный <rect width="1" height="1">, сгруппированный по цвету. */
function gridToSvg(g, palette, { size, viewBox }) {
  const buckets = new Map();
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[y].length; x++) {
      const ch = g[y][x];
      if (ch === '.') continue;
      const color = palette[ch];
      if (!color) throw new Error(`Нет цвета для символа "${ch}"`);
      if (!buckets.has(color)) buckets.set(color, []);
      buckets.get(color).push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    }
  }
  const groups = [...buckets].map(([color, rects]) => `<g fill="${color}">${rects.join('')}</g>`);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size[0]}" height="${size[1]}"` +
    ` viewBox="${viewBox}" shape-rendering="crispEdges">${groups.join('')}</svg>\n`
  );
}

/** Для спрайта горизонтальные серии одного цвета склеиваются — иначе файл раздувается. */
function gridToSvgRuns(g, palette, { size, viewBox }) {
  const buckets = new Map();
  for (let y = 0; y < g.length; y++) {
    let x = 0;
    while (x < g[y].length) {
      const ch = g[y][x];
      if (ch === '.') { x++; continue; }
      let end = x;
      while (end + 1 < g[y].length && g[y][end + 1] === ch) end++;
      const color = palette[ch];
      if (!color) throw new Error(`Нет цвета для символа "${ch}"`);
      if (!buckets.has(color)) buckets.set(color, []);
      buckets.get(color).push(`<rect x="${x}" y="${y}" width="${end - x + 1}" height="1"/>`);
      x = end + 1;
    }
  }
  const groups = [...buckets].map(([color, rects]) => `<g fill="${color}">${rects.join('')}</g>`);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size[0]}" height="${size[1]}"` +
    ` viewBox="${viewBox}" shape-rendering="crispEdges">${groups.join('')}</svg>\n`
  );
}

/* ------------------------------------------------------------------ */
/* Палитра (согласована с app/globals.css, п. 6.7.3)                   */
/* ------------------------------------------------------------------ */

const OUTLINE = '#17130F';
const CITRUS = '#FF8A00';
const LIME = '#A3E635';

/** Тона кожи: base / shadow / mouth. Пять тонов при требуемом минимуме четыре. */
const SKIN = {
  light: { s: '#F2C89A', d: '#D6A275', m: '#A05C4A' },
  fair: { s: '#E8B48A', d: '#C68E62', m: '#94513F' },
  tan: { s: '#C98B5A', d: '#A66B3E', m: '#7E4433' },
  brown: { s: '#9C6239', d: '#7A4728', m: '#5E3420' },
  deep: { s: '#6E4426', d: '#553017', m: '#3E2314' },
};

/** Цвета волос: base / shadow. */
const HAIR = {
  ginger: ['#C75B12', '#96430C'],
  copper: ['#D9722A', '#A8511A'],
  auburn: ['#943F22', '#6E2C16'],
  darkbrown: ['#4B3423', '#332215'],
  black: ['#2E251C', '#1B1610'],
  blond: ['#E0BE6C', '#B8964B'],
  platinum: ['#EFE0BE', '#C4B590'],
  grey: ['#B5ADA0', '#8B8375'],
  ash: ['#8B6B45', '#6A5033'],
  lightbrown: ['#A87A4C', '#7F5934'],
};

/** Приглушённые цвета одежды + два акцента интерфейса. */
const SHIRT = {
  steel: '#3F5B72',
  navy: '#2F4858',
  slate: '#46586B',
  olive: '#4A6B52',
  moss: '#5C7048',
  brick: '#7A4B3A',
  clay: '#9A5F45',
  sand: '#8A6A45',
  ash: '#5B5147',
  plum: '#6E3B4B',
  citrus: CITRUS,
  lime: LIME,
  cream: '#C9BFA8',
  rust: '#A8552A',
};

/* ------------------------------------------------------------------ */
/* Базовый шаблон портрета 16×16                                       */
/* ------------------------------------------------------------------ */
/*
 *  o — контур        s — кожа       d — тень кожи   m — рот
 *  e — глаз          h — волосы     H — тень волос  b — борода
 *  g — оправа очков  c — головной убор              C — акцент убора
 *  t — футболка      T — акцент одежды
 *
 *  Голова: контур y=3 и y=11, лицо x=5..10 / y=4..10 — одинаковая посадка
 *  во всех 24 портретах, чтобы набор читался как один сет.
 */
const BASE = [
  '................', // 0
  '................', // 1
  '................', // 2
  '.....oooooo.....', // 3  верх черепа
  '....ohhhhhho....', // 4  волосы
  '....ohhhhhho....', // 5  волосы / чёлка
  '....osssssso....', // 6  лоб
  '....osesseso....', // 7  глаза
  '....osssdsso....', // 8  нос
  '....ossmmsso....', // 9  рот
  '....osssssso....', // 10 подбородок
  '.....oooooo.....', // 11 линия челюсти
  '......oddo......', // 12 шея
  '...otttoottto...', // 13 плечи + ворот
  '..otttttttttto..', // 14 торс
  '.otttttttttttto.', // 15 торс
];

const baseGrid = () => gridFromRows(BASE);

/* ---- причёски ---------------------------------------------------- */

/**
 * Объёмная шапка волос: макушка становится волосами, контур уезжает выше.
 * `top` — самый верхний ряд волос (3 — прилизанная причёска, 1 — объёмная).
 */
function hairCrown(g, top = 3) {
  fill(g, 4, top, 11, 3, 'h');
  fill(g, 4, top - 1, 11, top - 1, 'o');
  set(g, 3, 3, 'o');
  set(g, 12, 3, 'o');
}

/**
 * Ниже линии челюсти силуэт головы сужается, и боковой элемент (волосы, капюшон)
 * повисает с дыркой в один пиксель. Эта функция её закрывает.
 */
function fillNeckGap(g, yEnd, ch) {
  if (yEnd < 11) return;
  pxs(g, [[4, 11], [11, 11]], ch);
  if (yEnd >= 12) pxs(g, [[4, 12], [5, 12], [10, 12], [11, 12]], ch);
  else pxs(g, [[4, 12], [11, 12]], 'o');
}

/** Пряди по бокам головы: волосы идут поверх контура лица, снаружи — новый контур. */
function hairSides(g, yEnd, yStart = 3) {
  for (let y = yStart; y <= yEnd; y++) {
    set(g, 3, y, 'h');
    set(g, 2, y, 'o');
    set(g, 12, y, 'h');
    set(g, 13, y, 'o');
  }
  fill(g, 2, yStart - 1, 3, yStart - 1, 'o');
  fill(g, 12, yStart - 1, 13, yStart - 1, 'o');
  fill(g, 2, yEnd + 1, 3, yEnd + 1, 'o');
  fill(g, 12, yEnd + 1, 13, yEnd + 1, 'o');
  fillNeckGap(g, yEnd, 'h');
}

/** Чёлка: ряд 5 полностью закрыт волосами + пряди заходят на висок. */
function bangs(g) {
  fill(g, 5, 5, 10, 5, 'h');
  set(g, 5, 6, 'h');
  set(g, 10, 6, 'H');
}

/** Короткий ёжик — волос почти нет, виден только тонкий валик. */
function crop(g) {
  fill(g, 5, 4, 10, 4, 'h');
  fill(g, 5, 5, 10, 5, 'H');
}

/** Лысина: ряды волос заменяются кожей, добавляются уши. */
function bald(g) {
  fill(g, 5, 4, 10, 4, 's');
  fill(g, 5, 5, 10, 5, 's');
  ears(g);
}

function ears(g) {
  set(g, 4, 8, 'd');
  set(g, 11, 8, 'd');
}

/** Волосы, выбивающиеся из-под головного убора, — иначе цвет волос не читается. */
function sideburns(g, y0 = 6, y1 = 8) {
  for (let y = y0; y <= y1; y++) {
    set(g, 3, y, 'h');
    set(g, 2, y, 'o');
    set(g, 12, y, 'h');
    set(g, 13, y, 'o');
  }
  fill(g, 2, y1 + 1, 3, y1 + 1, 'o');
  fill(g, 12, y1 + 1, 13, y1 + 1, 'o');
}

/** Хвост сзади: жгут за правым плечом. */
function ponytail(g) {
  hairCrown(g);
  for (let y = 3; y <= 5; y++) {
    set(g, 3, y, 'h');
    set(g, 2, y, 'o');
  }
  fill(g, 2, 2, 3, 2, 'o');
  fill(g, 2, 6, 3, 6, 'o');
  fill(g, 12, 2, 14, 2, 'o');
  for (let y = 3; y <= 10; y++) {
    set(g, 12, y, 'h');
    set(g, 13, y, y % 2 ? 'H' : 'h');
    set(g, 14, y, 'o');
  }
  fill(g, 12, 11, 14, 11, 'o');
}

/** Две косы вдоль плеч с перехватом-резинкой. */
function braids(g) {
  hairCrown(g);
  hairSides(g, 9);
  for (let y = 10; y <= 13; y++) {
    const ch = y === 12 ? 'C' : y % 2 ? 'H' : 'h';
    set(g, 3, y, ch);
    set(g, 2, y, 'o');
    set(g, 12, y, ch);
    set(g, 13, y, 'o');
  }
  pxs(g, [[2, 14], [3, 14], [12, 14], [13, 14]], 'o');
}

/** Дреды: пряди с чередованием тона, свисают ниже плеч. */
function dreads(g) {
  hairCrown(g, 1);
  for (let y = 1; y <= 13; y++) {
    set(g, 3, y, y % 3 === 0 ? 'H' : 'h');
    set(g, 2, y, 'o');
    set(g, 12, y, y % 3 === 1 ? 'H' : 'h');
    set(g, 13, y, 'o');
  }
  fill(g, 2, 0, 3, 0, 'o');
  fill(g, 12, 0, 13, 0, 'o');
  pxs(g, [[2, 14], [3, 14], [12, 14], [13, 14]], 'o');
  fillNeckGap(g, 13, 'h');
}

/** Афро: широкий объём вокруг головы. */
function afro(g) {
  hairCrown(g, 1);
  fill(g, 3, 2, 12, 5, 'h');
  for (let y = 2; y <= 5; y++) {
    set(g, 2, y, 'o');
    set(g, 13, y, 'o');
  }
  fill(g, 2, 1, 3, 1, 'o');
  fill(g, 12, 1, 13, 1, 'o');
  fill(g, 2, 6, 3, 6, 'o');
  fill(g, 12, 6, 13, 6, 'o');
  // «крапинки» тени для фактуры
  pxs(g, [[4, 2], [7, 1], [10, 2], [3, 4], [12, 3], [6, 3], [9, 4]], 'H');
}

/** Кудри: бугристая макушка и завитки у висков. */
function curly(g) {
  hairCrown(g, 1);
  pxs(g, [[4, 0], [5, 0], [8, 0], [9, 0], [10, 0], [11, 0]], 'o');
  pxs(g, [[6, 0], [7, 0]], 'h');
  pxs(g, [[5, 1], [8, 1], [11, 1], [5, 2], [9, 2], [6, 3], [10, 3]], 'H');
  for (let y = 2; y <= 6; y++) {
    set(g, 3, y, y % 2 ? 'H' : 'h');
    set(g, 2, y, 'o');
    set(g, 12, y, y % 2 ? 'h' : 'H');
    set(g, 13, y, 'o');
  }
  fill(g, 2, 1, 3, 1, 'o');
  fill(g, 12, 1, 13, 1, 'o');
  fill(g, 2, 7, 3, 7, 'o');
  fill(g, 12, 7, 13, 7, 'o');
}

/* ---- головные уборы ---------------------------------------------- */

/** Бейсболка с козырьком. */
function cap(g) {
  fill(g, 5, 2, 10, 2, 'o');
  fill(g, 4, 3, 11, 3, 'c');
  pxs(g, [[3, 3], [12, 3]], 'o');
  fill(g, 5, 4, 10, 4, 'c');
  fill(g, 3, 5, 12, 5, 'C'); // козырёк
  pxs(g, [[2, 5], [13, 5], [3, 6], [12, 6]], 'o');
  set(g, 7, 2, 'C');
}

/** Бейсболка задом наперёд: козырёк уходит назад, спереди — застёжка. */
function capBack(g) {
  fill(g, 5, 2, 10, 2, 'o');
  fill(g, 4, 3, 11, 3, 'c');
  pxs(g, [[3, 3], [12, 3]], 'o');
  fill(g, 5, 4, 10, 4, 'c');
  fill(g, 5, 5, 10, 5, 'C');
  pxs(g, [[3, 4], [4, 4], [11, 4], [12, 4]], 'C'); // хвосты козырька по бокам
  pxs(g, [[2, 4], [13, 4], [3, 5], [4, 5], [11, 5], [12, 5]], 'o');
  pxs(g, [[7, 5], [8, 5]], 'c'); // застёжка
}

/** Вязаная шапка с отворотом. */
function beanie(g) {
  fill(g, 6, 1, 9, 1, 'c');
  fill(g, 5, 2, 10, 2, 'c');
  fill(g, 4, 3, 11, 3, 'c');
  fill(g, 5, 4, 10, 4, 'c');
  fill(g, 6, 0, 9, 0, 'o');
  pxs(g, [[5, 1], [10, 1], [4, 2], [11, 2], [3, 3], [12, 3]], 'o');
  fill(g, 4, 5, 11, 5, 'C'); // отворот
  pxs(g, [[3, 5], [12, 5], [4, 6], [11, 6]], 'o');
}

/** Бандана с узлом сбоку. */
function bandana(g) {
  fill(g, 5, 3, 10, 3, 'c');
  fill(g, 4, 4, 11, 4, 'c');
  fill(g, 5, 5, 10, 5, 'C');
  pxs(g, [[3, 4], [12, 4]], 'o');
  pxs(g, [[12, 5], [13, 5], [13, 6]], 'c'); // узел
  pxs(g, [[11, 5], [14, 5], [12, 6], [14, 6], [12, 7], [13, 7]], 'o');
  // волосы выбиваются из-под банданы
  pxs(g, [[3, 6], [3, 7], [3, 8]], 'h');
  pxs(g, [[2, 6], [2, 7], [2, 8], [2, 9], [3, 9]], 'o');
}

/** Берет со «стебельком», сдвинутый набок. */
function beret(g) {
  fill(g, 4, 3, 11, 3, 'c');
  fill(g, 5, 2, 11, 2, 'c');
  fill(g, 5, 4, 10, 4, 'c');
  pxs(g, [[12, 3], [12, 4]], 'c');
  fill(g, 5, 1, 10, 1, 'o');
  pxs(g, [[4, 2], [12, 2], [3, 3], [13, 3], [13, 4], [12, 5], [4, 5]], 'o');
  set(g, 8, 1, 'C');
  set(g, 8, 0, 'o');
}

/** Панама с широкими полями. */
function bucketHat(g) {
  fill(g, 5, 2, 10, 2, 'c');
  fill(g, 4, 3, 11, 3, 'c');
  fill(g, 5, 1, 10, 1, 'o');
  pxs(g, [[4, 2], [11, 2], [3, 3], [12, 3]], 'o');
  fill(g, 2, 4, 13, 4, 'C'); // поля
  fill(g, 3, 5, 12, 5, 'C');
  pxs(g, [[1, 4], [14, 4], [2, 5], [13, 5], [3, 6], [12, 6]], 'o');
}

/** Спортивная повязка на лоб. */
function headband(g) {
  fill(g, 5, 4, 10, 4, 'h');
  fill(g, 4, 5, 11, 5, 'c');
  fill(g, 5, 6, 10, 6, 'C');
  pxs(g, [[3, 5], [12, 5], [3, 6], [12, 6]], 'o');
  pxs(g, [[3, 7], [3, 8]], 'c'); // хвостик завязки
  pxs(g, [[2, 7], [2, 8], [2, 9], [3, 9]], 'o');
}

/** Наушники: дуга над головой, дужки по вискам и амбушюры у ушей. */
function headphones(g) {
  fill(g, 4, 1, 11, 1, 'c'); // дуга
  fill(g, 4, 0, 11, 0, 'o');
  pxs(g, [[3, 1], [12, 1]], 'c');
  pxs(g, [[3, 0], [12, 0]], 'o');
  for (let y = 2; y <= 5; y++) {
    set(g, 3, y, 'c'); // дужка
    set(g, 2, y, 'o');
    set(g, 12, y, 'c');
    set(g, 13, y, 'o');
  }
  for (let y = 6; y <= 8; y++) {
    set(g, 3, y, 'C'); // амбушюр
    set(g, 2, y, 'o');
    set(g, 12, y, 'C');
    set(g, 13, y, 'o');
  }
  pxs(g, [[2, 9], [3, 9], [12, 9], [13, 9]], 'o');
}

/* ---- лицо -------------------------------------------------------- */

/**
 * Очки: верхний ободок с перемычкой идёт по ряду бровей, боковые ободки — ниже.
 * Ряд глаз намеренно не трогаем, иначе на 16 px очки сливаются в чёрную полосу.
 */
function glasses(g) {
  fill(g, 5, 6, 10, 6, 'g');
  pxs(g, [[5, 8], [6, 8], [9, 8], [10, 8]], 'g');
}

/** Усы: рот опускается на ряд ниже. */
function moustache(g) {
  fill(g, 6, 9, 9, 9, 'b');
  pxs(g, [[7, 10], [8, 10]], 'm');
}

/** Борода: бакенбарды, скулы и подбородок; `long` добавляет клин на шею. */
function beard(g, { long = false } = {}) {
  pxs(g, [[5, 7], [10, 7], [5, 8], [10, 8], [5, 9], [10, 9], [6, 9], [9, 9]], 'b');
  fill(g, 5, 10, 10, 10, 'b');
  pxs(g, [[7, 9], [8, 9]], 'm');
  if (long) {
    fill(g, 6, 11, 9, 11, 'b');
    fill(g, 7, 12, 8, 12, 'b');
  }
}

/* ---- одежда ------------------------------------------------------ */

function collarPolo(g) {
  pxs(g, [[5, 13], [6, 13], [9, 13], [10, 13]], 'T');
  pxs(g, [[7, 14], [8, 15]], 'T');
}

function collarSweater(g) {
  fill(g, 4, 13, 6, 13, 'T');
  fill(g, 9, 13, 11, 13, 'T');
  pxs(g, [[3, 14], [12, 14], [2, 15], [13, 15]], 'T');
}

function collarV(g) {
  pxs(g, [[7, 13], [8, 13], [7, 14], [8, 14]], 'd');
  pxs(g, [[6, 13], [9, 13], [6, 14], [9, 14], [7, 15], [8, 15]], 'T');
}

function cardigan(g) {
  fill(g, 7, 13, 8, 15, 'T'); // планка на молнии
  pxs(g, [[4, 13], [11, 13], [3, 14], [12, 14]], 'T');
}

function stripe(g) {
  for (let x = 0; x < 16; x++) if (g[14][x] === 't') g[14][x] = 'T';
}

function hoodie(g) {
  for (let y = 5; y <= 12; y++) {
    set(g, 3, y, 'T');
    set(g, 2, y, 'o');
    set(g, 12, y, 'T');
    set(g, 13, y, 'o');
  }
  fillNeckGap(g, 12, 'T');
  fill(g, 2, 13, 4, 13, 'T');
  fill(g, 11, 13, 13, 13, 'T');
  pxs(g, [[6, 14], [9, 14], [6, 15], [9, 15]], 'T');
}

/* ------------------------------------------------------------------ */
/* 24 персонажа — подписи совпадают с lib/avatars.ts                   */
/* ------------------------------------------------------------------ */

const AVATARS = [
  {
    id: 'pixel-01', label: 'Рыжий в кепке',
    skin: 'fair', hair: 'ginger', shirt: 'steel', accent: 'navy',
    hat: CITRUS, hatAccent: '#C26A00',
    draw: (g) => { crop(g); cap(g); sideburns(g); stripe(g); },
  },
  {
    id: 'pixel-02', label: 'Девушка с каре',
    skin: 'light', hair: 'darkbrown', shirt: 'plum', accent: '#8C5064',
    draw: (g) => { hairCrown(g); hairSides(g, 10); bangs(g); collarV(g); },
  },
  {
    id: 'pixel-03', label: 'Бородач в очках',
    skin: 'tan', hair: 'darkbrown', shirt: 'olive', accent: '#3A5541',
    beard: '#332215',
    draw: (g) => { crop(g); beard(g, { long: true }); glasses(g); collarSweater(g); },
  },
  {
    id: 'pixel-04', label: 'Кудрявая в наушниках',
    skin: 'brown', hair: 'black', shirt: 'moss', accent: LIME,
    hat: '#2F4858', hatAccent: CITRUS,
    draw: (g) => { curly(g); headphones(g); stripe(g); },
  },
  {
    id: 'pixel-05', label: 'Блондин в худи',
    skin: 'light', hair: 'blond', shirt: 'ash', accent: '#7A6A55',
    draw: (g) => { hairCrown(g); bangs(g); hoodie(g); },
  },
  {
    id: 'pixel-06', label: 'Брюнетка с хвостом',
    skin: 'fair', hair: 'black', shirt: 'navy', accent: '#4A6E8A',
    draw: (g) => { ponytail(g); bangs(g); collarV(g); },
  },
  {
    id: 'pixel-07', label: 'Седой в свитере',
    skin: 'light', hair: 'grey', shirt: 'brick', accent: '#9C6350',
    draw: (g) => { crop(g); ears(g); collarSweater(g); },
  },
  {
    id: 'pixel-08', label: 'Девушка в бандане',
    skin: 'tan', hair: 'darkbrown', shirt: 'olive', accent: '#6E8A56',
    hat: '#C1442E', hatAccent: '#94301F',
    draw: (g) => { bandana(g); stripe(g); },
  },
  {
    id: 'pixel-09', label: 'Парень с усами',
    skin: 'fair', hair: 'ash', shirt: 'slate', accent: '#6B7E92',
    beard: '#6A5033',
    draw: (g) => { crop(g); ears(g); moustache(g); collarPolo(g); },
  },
  {
    id: 'pixel-10', label: 'Рыжая с косами',
    skin: 'light', hair: 'ginger', shirt: 'plum', accent: '#8C5064',
    hatAccent: CITRUS,
    draw: (g) => { braids(g); bangs(g); collarV(g); },
  },
  {
    id: 'pixel-11', label: 'Лысый в очках',
    skin: 'tan', hair: 'darkbrown', shirt: 'ash', accent: '#7D7264',
    draw: (g) => { bald(g); glasses(g); collarPolo(g); },
  },
  {
    id: 'pixel-12', label: 'Девушка в берете',
    skin: 'light', hair: 'auburn', shirt: 'sand', accent: '#B08E5F',
    hat: '#6E3B4B', hatAccent: '#8C5064',
    draw: (g) => { hairCrown(g); hairSides(g, 11); beret(g); collarV(g); },
  },
  {
    id: 'pixel-13', label: 'Спортсмен с повязкой',
    skin: 'fair', hair: 'darkbrown', shirt: 'navy', accent: LIME,
    hat: LIME, hatAccent: '#7FB425',
    draw: (g) => { crop(g); headband(g); stripe(g); },
  },
  {
    id: 'pixel-14', label: 'Тёмненькая в кофте',
    skin: 'deep', hair: 'black', shirt: 'brick', accent: '#A8664B',
    draw: (g) => { hairCrown(g); hairSides(g, 9); bangs(g); cardigan(g); },
  },
  {
    id: 'pixel-15', label: 'Парень с дредами',
    skin: 'brown', hair: 'black', shirt: 'olive', accent: '#6E8A56',
    draw: (g) => { dreads(g); collarV(g); },
  },
  {
    id: 'pixel-16', label: 'Девушка в панаме',
    skin: 'light', hair: 'blond', shirt: 'moss', accent: LIME,
    hat: '#7A6A55', hatAccent: '#94826A',
    draw: (g) => { hairCrown(g); hairSides(g, 10); bucketHat(g); stripe(g); },
  },
  {
    id: 'pixel-17', label: 'Хипстер с бородой',
    skin: 'fair', hair: 'darkbrown', shirt: 'rust', accent: '#C97A44',
    beard: '#3D2A1B',
    draw: (g) => { hairCrown(g); bangs(g); beard(g, { long: true }); collarSweater(g); },
  },
  {
    id: 'pixel-18', label: 'Короткая стрижка',
    skin: 'brown', hair: 'black', shirt: 'slate', accent: '#6B7E92',
    draw: (g) => { crop(g); ears(g); collarPolo(g); },
  },
  {
    id: 'pixel-19', label: 'Парень в бейсболке задом наперёд',
    skin: 'fair', hair: 'ash', shirt: 'ash', accent: '#7D7264',
    hat: '#3F5B72', hatAccent: CITRUS,
    draw: (g) => { crop(g); capBack(g); sideburns(g); stripe(g); },
  },
  {
    id: 'pixel-20', label: 'Девушка в очках',
    skin: 'light', hair: 'ash', shirt: 'plum', accent: '#8C5064',
    draw: (g) => { hairCrown(g); hairSides(g, 10); bangs(g); glasses(g); collarV(g); },
  },
  {
    id: 'pixel-21', label: 'Русый в поло',
    skin: 'fair', hair: 'lightbrown', shirt: 'olive', accent: 'cream',
    draw: (g) => { crop(g); ears(g); collarPolo(g); },
  },
  {
    id: 'pixel-22', label: 'Афропричёска',
    skin: 'deep', hair: 'black', shirt: 'citrus', accent: '#C26A00',
    draw: (g) => { afro(g); collarV(g); },
  },
  {
    id: 'pixel-23', label: 'Парень в шапке',
    skin: 'tan', hair: 'darkbrown', shirt: 'ash', accent: '#7D7264',
    hat: '#2F4858', hatAccent: LIME,
    draw: (g) => { crop(g); beanie(g); sideburns(g); stripe(g); },
  },
  {
    id: 'pixel-24', label: 'Девушка с челкой',
    skin: 'light', hair: 'copper', shirt: 'steel', accent: '#5C7E9A',
    draw: (g) => { hairCrown(g); hairSides(g, 12); bangs(g); collarV(g); },
  },
];

function avatarPalette(spec) {
  const skin = SKIN[spec.skin];
  const [hair, hairShadow] = HAIR[spec.hair];
  const shirt = SHIRT[spec.shirt] ?? spec.shirt;
  const accent = SHIRT[spec.accent] ?? spec.accent ?? hairShadow;
  return {
    o: OUTLINE,
    s: skin.s,
    d: skin.d,
    m: skin.m,
    e: OUTLINE,
    h: hair,
    H: hairShadow,
    b: spec.beard ?? hairShadow,
    g: OUTLINE,
    c: spec.hat ?? hair,
    C: spec.hatAccent ?? hairShadow,
    t: shirt,
    T: accent,
  };
}

/**
 * Портреты берутся из DiceBear (стиль `pixel-art`), а не из матриц выше.
 *
 * Файлы по-прежнему статика в репозитории, а не запросы к api.dicebear.com:
 * лента рейтинга рисует до десятка аватаров сразу, и внешний хост на этом месте
 * означал бы столько же сторонних запросов на каждый рендер плюс неработающее
 * приложение без сети. Ассеты фиксируются в git ровно так же, как раньше.
 *
 * `seed` — сам id пресета, поэтому генерация детерминирована: повторный запуск
 * скрипта даёт те же 24 портрета, а значения `avatar_id` в БД остаются валидными.
 */
function buildAvatars() {
  const dir = join(PUBLIC, 'avatars');
  mkdirSync(dir, { recursive: true });
  for (const spec of AVATARS) {
    const svg = createAvatar(pixelArt, {
      seed: spec.id,
      // Цитрусовая подложка — та же, что раньше давала обёртка аватара (п. 6.7.3).
      backgroundColor: ['ff8a00'],
      // Круглую маску даёт сам компонент аватара, поэтому в файле углы не режем.
      radius: 0,
      // Штатная кадрировка DiceBear: голова по центру, плечи снизу — ровно то,
      // что нужно круглой маске. Рамки вокруг аватара нет, ужимать портрет незачем.
      scale: 100,
    }).toString();
    writeFileSync(join(dir, `${spec.id}.svg`), svg, 'utf8');
  }
  return AVATARS.length;
}

/* ------------------------------------------------------------------ */
/* Спрайтшит ходьбы: 8 кадров 32×32 → 256×32                           */
/* ------------------------------------------------------------------ */

const FRAMES = 8;
const FRAME = 32;

const WALK_PALETTE = {
  O: OUTLINE,
  K: '#E8B48A', // кожа
  D: '#C68E62', // тень кожи
  M: '#94513F', // рот
  H: '#4B3423', // волосы
  S: CITRUS, // футболка
  s: '#C96C00', // футболка, теневая сторона и ближняя рука
  a: '#8F4B00', // дальняя рука
  P: '#3F5B72', // штаны, ближняя нога
  p: '#2A3E4F', // штаны, дальняя нога
  B: '#241C16', // обувь
  b: '#171210', // обувь дальняя
};

/** Толстая линия по Брезенхему — «кость» конечности шириной t. */
function limb(g, ox, x0, y0, x1, y1, ch, t = 2) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n);
    const y = Math.round(y0 + ((y1 - y0) * i) / n);
    for (let k = 0; k < t; k++) set(g, ox + x + k, y, ch);
  }
}

/**
 * Параметры конечности для фазы p.
 * Помимо синуса добавлена составляющая от косинуса — без неё кадры 1 и 3
 * (и 5 с 7) совпали бы по позиции и цикл выглядел бы четырёхкадровым.
 */
function limbPhase(p) {
  const swing = Math.max(0, Math.cos(p)); // нога идёт вперёд — колено согнуто, стопа поднята
  return {
    dx: Math.round(4 * Math.sin(p)),
    knee: Math.round(2 * Math.sin(p) + 1.5 * swing),
    lift: Math.round(1.4 * swing),
  };
}

function drawLeg(g, ox, prm, dy, chLeg, chShoe) {
  const hipX = 16;
  const hipY = 23 + dy;
  const kneeX = 16 + prm.knee;
  const kneeY = 26 + dy;
  // стопа не участвует в покачивании корпуса: линия земли обязана стоять на месте,
  // иначе на кадрах с приседанием персонаж «проваливается» под пол
  const ankleX = 16 + prm.dx;
  const ankleY = 29 - prm.lift;
  limb(g, ox, hipX, hipY, kneeX, kneeY, chLeg, 2);
  limb(g, ox, kneeX, kneeY, ankleX, ankleY, chLeg, 2);
  fill(g, ox + ankleX - 1, ankleY + 1, ox + ankleX + 2, ankleY + 1, chShoe);
}

function drawArm(g, ox, prm, dy, ch, chHand) {
  const shX = 16;
  const shY = 15 + dy;
  const elX = 16 + Math.round(prm.knee * 0.8);
  const elY = 18 + dy;
  const haX = 16 + Math.round(prm.dx * 0.9);
  const haY = 21 + dy;
  limb(g, ox, shX, shY, elX, elY, ch, 2);
  limb(g, ox, elX, elY, haX, haY, ch, 2);
  fill(g, ox + haX, haY + 1, ox + haX + 1, haY + 1, chHand); // кисть
}

function drawWalkFrame(g, index) {
  const ox = index * FRAME;
  const p = (index / FRAMES) * Math.PI * 2;
  const near = limbPhase(p);
  const far = limbPhase(p + Math.PI);
  const dy = Math.abs(near.dx) >= 4 ? 1 : 0; // корпус проседает на максимальном шаге

  // дальняя нога и дальняя рука — под корпусом, поэтому рисуются первыми
  drawLeg(g, ox, far, dy, 'p', 'b');
  drawArm(g, ox, far, dy, 'a', 'D');

  // корпус
  fill(g, ox + 13, 14 + dy, ox + 19, 21 + dy, 'S');
  fill(g, ox + 13, 14 + dy, ox + 13, 21 + dy, 's'); // теневая сторона спины
  fill(g, ox + 13, 22 + dy, ox + 19, 23 + dy, 'P');
  for (let y = 14 + dy; y <= 23 + dy; y++) {
    set(g, ox + 12, y, 'O');
    set(g, ox + 20, y, 'O');
  }

  // голова, вид сбоку, лицом вправо
  fill(g, ox + 13, 5 + dy, ox + 20, 12 + dy, 'K');
  fill(g, ox + 13, 5 + dy, ox + 20, 6 + dy, 'H');
  fill(g, ox + 13, 7 + dy, ox + 15, 10 + dy, 'H'); // затылок
  for (let x = 13; x <= 20; x++) {
    set(g, ox + x, 4 + dy, 'O');
    set(g, ox + x, 13 + dy, 'O');
  }
  for (let y = 5 + dy; y <= 12 + dy; y++) {
    set(g, ox + 12, y, 'O');
    set(g, ox + 21, y, 'O');
  }
  set(g, ox + 18, 9 + dy, 'O'); // глаз
  set(g, ox + 20, 11 + dy, 'M'); // рот
  set(g, ox + 16, 10 + dy, 'D'); // ухо
  fill(g, ox + 19, 12 + dy, ox + 20, 12 + dy, 'D'); // подбородок

  // ближняя нога и ближняя рука (рука качается в противофазе к ноге)
  drawLeg(g, ox, near, dy, 'P', 'B');
  drawArm(g, ox, near, dy, 's', 'K');
}

function buildWalkSprite() {
  const dir = join(PUBLIC, 'sprites');
  mkdirSync(dir, { recursive: true });
  const g = emptyGrid(FRAME * FRAMES, FRAME);
  for (let i = 0; i < FRAMES; i++) drawWalkFrame(g, i);
  assertGrid(g, 256, 32, 'walk');
  const svg = gridToSvgRuns(g, WALK_PALETTE, { size: [256, 32], viewBox: '0 0 256 32' });
  writeFileSync(join(dir, 'walk.svg'), svg, 'utf8');
  return 1;
}

/* ------------------------------------------------------------------ */
/* Уборка дефолтных ассетов Next                                       */
/* ------------------------------------------------------------------ */

function cleanDefaults() {
  const defaults = ['file.svg', 'globe.svg', 'next.svg', 'vercel.svg', 'window.svg'];
  let removed = 0;
  for (const f of defaults) {
    const p = join(PUBLIC, f);
    if (existsSync(p)) {
      rmSync(p);
      removed++;
    }
  }
  return removed;
}

/* ------------------------------------------------------------------ */

const avatars = buildAvatars();
const sprites = buildWalkSprite();
const removed = cleanDefaults();

console.log(`Аватары: ${avatars} · спрайты: ${sprites} · удалено дефолтных: ${removed}`);
