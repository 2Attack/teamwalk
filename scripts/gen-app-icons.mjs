#!/usr/bin/env node
/**
 * Генератор иконок приложения: фавикон, иконка iOS и набор для веб-манифеста.
 *
 * Рисунок — долька цитруса на пиксельной сетке 16×16. Спрайт ходьбы из
 * `public/sprites/walk.svg` на эту роль не подошёл: кадр фигуры занимает 10×27
 * пикселей, и на фавиконе 16×16 от неё остаётся нечитаемая вертикальная полоска.
 * Долька читается и в 16 пикселей, и отвечает названию приложения.
 *
 * Сетка строится кодом, а не ASCII-матрицей: окружность и разрезы долек — это
 * формула, и подправить радиус проще числом, чем перерисовкой 256 символов.
 *
 * Цвета взяты из палитры приложения (`app/globals.css`) и спрайта: фон совпадает
 * с `--background` и с `themeColor` в layout.tsx, мякоть и корка — из палитры
 * самого спрайта ходьбы, поэтому иконка не выбивается из набора.
 *
 * Запуск: `npm run gen:icons:app` (нужен `sharp` — он есть в зависимостях Next).
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const APP = join(ROOT, 'app');

/** Сторона пиксельной сетки. Все растровые размеры кратны ей, кроме 180 (см. ниже). */
const GRID = 16;

const COLOR = {
  /** `--background` из globals.css; тот же цвет объявлен как themeColor. */
  bg: '#17130F',
  /** Корка и разрезы между дольками — тёмная оранжевая из палитры спрайта. */
  rind: '#C96C00',
  /** Мякоть — основная оранжевая оттуда же. */
  flesh: '#FF8A00',
};

/**
 * Пиксели дольки. `null` — прозрачный.
 *
 * Разрезы сделаны крестом, а не шестью лучами: на 16 пикселях луч под углом
 * 60° вырождается в пунктир из отдельных точек и читается как шум.
 */
function slicePixels() {
  const c = GRID / 2;
  const rows = [];
  for (let y = 0; y < GRID; y += 1) {
    const row = [];
    for (let x = 0; x < GRID; x += 1) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const d = Math.hypot(dx, dy);

      if (d > 7.4) row.push(null);
      else if (d > 5.9) row.push(COLOR.rind);
      else if (Math.abs(dx) < 0.6 || Math.abs(dy) < 0.6) row.push(COLOR.rind);
      else row.push(COLOR.flesh);
    }
    rows.push(row);
  }
  return rows;
}

/**
 * SVG из сетки. Соседние пиксели одного цвета в строке сливаются в один rect:
 * без этого в файле лежало бы 256 прямоугольников вместо примерно сорока.
 *
 * `padding` — доля стороны, оставляемая пустой по краям. Нужен для maskable-иконки
 * Android: система обрезает её под свою маску, и рисунок обязан уместиться в
 * безопасную зону, иначе у дольки срежет края.
 */
function toSvg({ background = null, padding = 0 } = {}) {
  const rows = slicePixels();
  const inner = GRID * (1 - padding * 2);
  const offset = (GRID - inner) / 2;
  const scale = inner / GRID;

  const parts = [];
  if (background) parts.push(`<rect width="${GRID}" height="${GRID}" fill="${background}"/>`);

  for (let y = 0; y < GRID; y += 1) {
    let run = null;
    for (let x = 0; x <= GRID; x += 1) {
      const color = x < GRID ? rows[y][x] : null;
      if (run && run.color === color) {
        run.width += 1;
        continue;
      }
      if (run) {
        const rx = offset + run.x * scale;
        const ry = offset + y * scale;
        parts.push(
          `<rect x="${+rx.toFixed(4)}" y="${+ry.toFixed(4)}" width="${+(run.width * scale).toFixed(4)}" height="${+scale.toFixed(4)}" fill="${run.color}"/>`,
        );
      }
      run = color ? { color, x, width: 1 } : null;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${GRID}" height="${GRID}" viewBox="0 0 ${GRID} ${GRID}" shape-rendering="crispEdges">${parts.join('')}</svg>`;
}

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

/**
 * Контейнер ICO вокруг готового PNG.
 *
 * `sharp` формат ICO не пишет, а собственный фавикон нужен: браузеры сами тянут
 * `/favicon.ico`, и без него в табе остался бы дефолтный логотип Next. ICO с
 * Vista умеет хранить PNG как есть, поэтому достаточно 22-байтового заголовка.
 */
function toIco(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 — иконка (2 было бы курсором)
  header.writeUInt16LE(1, 4); // одно изображение в файле

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 означает 256
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2); // палитра не используется
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // цветовых плоскостей
  entry.writeUInt16LE(32, 6); // бит на пиксель
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  return Buffer.concat([header, entry, pngBuffer]);
}

const transparent = toSvg();
const opaque = toSvg({ background: COLOR.bg });
// 20% полей с каждой стороны — безопасная зона maskable по спецификации W3C.
const maskable = toSvg({ background: COLOR.bg, padding: 0.2 });

// Фавикон вектором: пиксельная сетка масштабируется без размытия на любом экране.
writeFileSync(join(APP, 'icon.svg'), transparent);
writeFileSync(join(APP, 'favicon.ico'), toIco(await png(transparent, 32), 32));

// iOS маску накладывает сам и прозрачность заливает чёрным — отдаём непрозрачную.
// 180 не кратно 16, но это единственный размер вне сетки и на глаз незаметно.
writeFileSync(join(APP, 'apple-icon.png'), await png(opaque, 180));

writeFileSync(join(PUBLIC, 'icon-192.png'), await png(opaque, 192));
writeFileSync(join(PUBLIC, 'icon-512.png'), await png(opaque, 512));
writeFileSync(join(PUBLIC, 'icon-maskable-512.png'), await png(maskable, 512));

console.log('Иконки собраны: app/icon.svg, app/favicon.ico, app/apple-icon.png,');
console.log('public/icon-192.png, public/icon-512.png, public/icon-maskable-512.png');
