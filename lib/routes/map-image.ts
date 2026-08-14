import { generateText } from 'ai';
import sharp from 'sharp';

import {
  AI_GATEWAY_IMAGE_MODEL,
  MAP_GRID_H,
  MAP_GRID_W,
  MAP_IMAGE_HEIGHT,
  MAP_IMAGE_TIMEOUT_MS,
  MAP_IMAGE_WIDTH,
} from '@/lib/config';
import type { MapDecorKind, MapLayoutDto, RouteCityDto } from '@/lib/types';

/**
 * Map background generation (spec § 6.12.5): image-to-image from a sketch of
 * the layout. The sketch is the style anchor — it fixes the composition (city
 * markers, biome hints, the trail) and the parchment base color, so every
 * route's picture comes out in the same family. The result is normalized to a
 * fixed 2:1 geometry, keeping the SVG overlay and the picture in one
 * coordinate system.
 */

/** Sketch scale: layout grid cell → pixels. 96×48 → 384×192. */
const SCALE = 4;
const SKETCH_W = MAP_GRID_W * SCALE;
const SKETCH_H = MAP_GRID_H * SCALE;

type Rgb = [number, number, number];

const PARCHMENT: Rgb = [230, 199, 147];
const INK: Rgb = [91, 61, 33];
const GOLD: Rgb = [201, 162, 39];

/** Biome hint colors — the prompt explains them to the model. */
const BIOME: Record<MapDecorKind, Rgb> = {
  tree: [106, 143, 60],
  mountain: [138, 122, 102],
  lake: [127, 168, 201],
  house: [161, 104, 58],
  anchor: [127, 168, 201],
};

function fillDisc(px: Buffer, cx: number, cy: number, r: number, [cr, cg, cb]: Rgb): void {
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(SKETCH_W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(SKETCH_H - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const i = (y * SKETCH_W + x) * 3;
      px[i] = cr;
      px[i + 1] = cg;
      px[i + 2] = cb;
    }
  }
}

/** Trail polylines in sketch pixels: city → its bends → next city. */
function trailPolylines(points: RouteCityDto[], layout: MapLayoutDto): number[][][] {
  const position = new Map(layout.cities.map((c) => [c.city, [c.x * SCALE, c.y * SCALE]]));
  const lines: number[][][] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const from = position.get(points[i].city);
    const to = position.get(points[i + 1].city);
    if (!from || !to) continue;
    const bends = layout.bends
      .filter((b) => b.after === points[i].city)
      .map((b) => [b.x * SCALE, b.y * SCALE]);
    lines.push([from, ...bends, to]);
  }
  return lines;
}

/**
 * The init sketch: parchment, biome blobs, city discs and a dotted gold trail.
 * Deliberately crude — its job is composition and palette, not beauty.
 */
export async function renderSketch(points: RouteCityDto[], layout: MapLayoutDto): Promise<Buffer> {
  const px = Buffer.alloc(SKETCH_W * SKETCH_H * 3);
  for (let i = 0; i < px.length; i += 3) {
    px[i] = PARCHMENT[0];
    px[i + 1] = PARCHMENT[1];
    px[i + 2] = PARCHMENT[2];
  }

  for (const piece of layout.decor) {
    fillDisc(px, piece.x * SCALE, piece.y * SCALE, 12, BIOME[piece.kind]);
  }

  // The trail carries the visiting order into the model — the sketch has no
  // other way to express it.
  for (const line of trailPolylines(points, layout)) {
    for (let i = 1; i < line.length; i += 1) {
      const [ax, ay] = line[i - 1];
      const [bx, by] = line[i];
      const length = Math.hypot(bx - ax, by - ay);
      for (let d = 0; d < length; d += 10) {
        fillDisc(px, ax + ((bx - ax) * d) / length, ay + ((by - ay) * d) / length, 2, GOLD);
      }
    }
  }

  for (const city of layout.cities) {
    fillDisc(px, city.x * SCALE, city.y * SCALE, 7, INK);
  }

  return sharp(px, { raw: { width: SKETCH_W, height: SKETCH_H, channels: 3 } })
    .png()
    .toBuffer();
}

/**
 * The prompt is a fixed template (spec § 6.12.5): a rigid style contract, not
 * a per-route creative brief. City names are deliberately NOT drawn — Cyrillic
 * is unreliable in image models, and labels are data living in the SVG layer.
 */
const IMAGE_PROMPT = `Перерисуй этот скетч как детализированную карту путешествия в стиле retro 16-bit RPG pixel-art.

Сохрани композицию скетча:
- тёмные круглые точки — города: оставь их ровно на своих местах и преврати в заметные пиксельные маркеры, рядом с каждым — маленькая характерная постройка (домик, башня, замок);
- золотая пунктирная линия — маршрут: перерисуй её той же траекторией как золотистую пунктирную тропу приключения;
- цветные пятна — подсказки биомов: зелёные — лес, серые — горы, синие — вода (озеро или море у края), коричневые — поселение.

Нарисуй богатый ландшафт по всей карте: леса, поля, реки, озёра, горы, холмы, дороги, мосты, деревушки, мельницы, крепости. Пустых углов быть не должно.

Палитра — тёплая и ограниченная, вокруг пергаментного базового цвета #e6c793: светлые оттенки для воды и дорог, средние для земли и лесов, тёмные для контуров и теней. Крупные выразительные пиксели, высокая детализация, вид сверху, широкий горизонтальный формат 2:1, художественная игровая карта — не географическая и не фотореалистичная.

Строго запрещено: любой текст, буквы, цифры и названия; интерфейс, кнопки, панели, легенды, рамки приложения, прогресс-бары.`;

/**
 * Full pipeline: sketch → image model via the AI Gateway → normalize to the
 * fixed 2:1 geometry. Returns the PNG buffer, or null on any failure — the
 * caller degrades to the SVG-only map.
 */
export async function generateMapImage(
  points: RouteCityDto[],
  layout: MapLayoutDto,
): Promise<Buffer | null> {
  const startedAt = Date.now();
  try {
    const sketch = await renderSketch(points, layout);

    const result = await generateText({
      model: AI_GATEWAY_IMAGE_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', image: sketch, mediaType: 'image/png' },
            { type: 'text', text: IMAGE_PROMPT },
          ],
        },
      ],
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(MAP_IMAGE_TIMEOUT_MS),
    });

    const file = result.files.find((f) => f.mediaType?.startsWith('image/'));
    if (!file) {
      console.warn('[routes] map image fail', {
        model: AI_GATEWAY_IMAGE_MODEL,
        latencyMs: Date.now() - startedAt,
        error: 'no image in response',
      });
      return null;
    }

    // `fit: fill` may stretch a non-2:1 result slightly — invisible on art,
    // and it guarantees the overlay's coordinate system.
    const png = await sharp(Buffer.from(file.uint8Array))
      .resize(MAP_IMAGE_WIDTH, MAP_IMAGE_HEIGHT, { fit: 'fill' })
      .png()
      .toBuffer();

    console.info('[routes] map image ok', {
      model: AI_GATEWAY_IMAGE_MODEL,
      latencyMs: Date.now() - startedAt,
      bytes: png.length,
    });
    return png;
  } catch (error) {
    console.warn('[routes] map image fail', {
      model: AI_GATEWAY_IMAGE_MODEL,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
