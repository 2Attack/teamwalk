'use client';

import { WalkerSprite } from '@/components/WalkerSprite';
import { MAP_GRID_H, MAP_GRID_W } from '@/lib/config';
import { fallbackLayout } from '@/lib/map/layout';
import type { MapDecorKind, MapLayoutDto, RouteCityDto } from '@/lib/types';

/**
 * Pixel treasure-map of the team route (spec § 6.12.5): parchment, a dotted
 * trail through city dots, decor glyphs, an X on the finish and the walker
 * sprite at the team position. Renders a stored LLM layout or the
 * deterministic fallback — the SVG itself is always drawn by us.
 *
 * Integer grid + crispEdges, the same trick as the pixel icons (spec § 6.7.4).
 * The map is decorative: exact numbers live in the caption next to it.
 */

interface RouteMapProps {
  route: RouteCityDto[];
  layout: MapLayoutDto | null;
  /**
   * Generated background picture (spec § 6.12.5). When present, the SVG layer
   * draws only the dynamics — walked trail, labels, walker — and the artwork
   * carries the parchment, terrain, city markers and the decorative trail.
   */
  mapImageUrl: string | null;
  /** Km walked on the route (already минус base_km). */
  walkedKm: number;
  /** aria-label of the decorative image. */
  label: string;
  className?: string;
}

interface Point {
  x: number;
  y: number;
}

/** Trail polyline of one route segment: city → bends → next city. */
interface Segment {
  fromKm: number;
  toKm: number;
  polyline: Point[];
  /** Geometric length of the polyline — km are projected onto it. */
  length: number;
}

const TRAIL_STEP = 2.4;

function segmentLength(polyline: Point[]): number {
  let total = 0;
  for (let i = 1; i < polyline.length; i += 1) {
    total += Math.hypot(polyline[i].x - polyline[i - 1].x, polyline[i].y - polyline[i - 1].y);
  }
  return total;
}

/** Point at `target` geometric distance along a polyline. */
function pointAlong(polyline: Point[], target: number): Point {
  let left = target;
  for (let i = 1; i < polyline.length; i += 1) {
    const a = polyline[i - 1];
    const b = polyline[i];
    const leg = Math.hypot(b.x - a.x, b.y - a.y);
    if (leg >= left && leg > 0) {
      const t = left / leg;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= leg;
  }
  return polyline[polyline.length - 1];
}

function buildSegments(route: RouteCityDto[], layout: MapLayoutDto): Segment[] {
  const positions = new Map(layout.cities.map((c) => [c.city, { x: c.x, y: c.y }]));
  const segments: Segment[] = [];

  for (let i = 0; i < route.length - 1; i += 1) {
    const from = positions.get(route[i].city);
    const to = positions.get(route[i + 1].city);
    if (!from || !to) continue;
    const bends = layout.bends
      .filter((b) => b.after === route[i].city)
      .map((b) => ({ x: b.x, y: b.y }));
    const polyline = [from, ...bends, to];
    segments.push({
      fromKm: route[i].km,
      toKm: route[i + 1].km,
      polyline,
      length: segmentLength(polyline),
    });
  }
  return segments;
}

/** Decor glyphs: [dx, dy] filled cells on the integer grid, drawn by us. */
const DECOR_CELLS: Record<MapDecorKind, Array<[number, number]>> = {
  tree: [
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
    [1, 3],
  ],
  mountain: [
    [2, 0],
    [1, 1],
    [2, 1],
    [3, 1],
    [0, 2],
    [4, 2],
  ],
  lake: [
    [1, 0],
    [2, 0],
    [0, 1],
    [3, 1],
    [1, 2],
    [2, 2],
  ],
  house: [
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
  anchor: [
    [1, 0],
    [1, 1],
    [0, 2],
    [1, 2],
    [2, 2],
    [1, 3],
  ],
};

/** Finish mark — the treasure-map X: two pixel diagonals. */
const FINISH_CELLS: Array<[number, number]> = [
  [-2, -2],
  [-1, -1],
  [0, 0],
  [1, 1],
  [2, 2],
  [-2, 2],
  [-1, 1],
  [1, -1],
  [2, -2],
];

export function RouteMap({ route, layout, mapImageUrl, walkedKm, label, className }: RouteMapProps) {
  const resolved = layout ?? fallbackLayout(route);
  const positions = new Map(resolved.cities.map((c) => [c.city, { x: c.x, y: c.y }]));
  const segments = buildSegments(route, resolved);
  const totalKm = route[route.length - 1]?.km ?? 0;
  const finished = walkedKm >= totalKm;

  // Trail dots, each classified walked/remaining by its km on the segment.
  const dots: Array<Point & { walked: boolean }> = [];
  for (const segment of segments) {
    if (segment.length <= 0) continue;
    for (let dist = TRAIL_STEP; dist < segment.length; dist += TRAIL_STEP) {
      const point = pointAlong(segment.polyline, dist);
      const kmAt = segment.fromKm + (dist / segment.length) * (segment.toKm - segment.fromKm);
      dots.push({ ...point, walked: kmAt <= walkedKm });
    }
  }

  // Team marker: km projected onto the geometric length of its segment.
  const current =
    segments.find((s) => walkedKm < s.toKm) ?? segments[segments.length - 1] ?? null;
  const marker = current
    ? finished
      ? current.polyline[current.polyline.length - 1]
      : pointAlong(
          current.polyline,
          current.toKm > current.fromKm
            ? (Math.max(0, walkedKm - current.fromKm) / (current.toKm - current.fromKm)) *
                current.length
            : 0,
        )
    : null;

  const nextCity = route.find((p) => p.km > walkedKm)?.city ?? null;
  const labelled = new Set(
    [route[0]?.city, nextCity, route[route.length - 1]?.city].filter(
      (city): city is string => Boolean(city),
    ),
  );

  // With a generated background the SVG keeps only the dynamic layer: the
  // artwork already draws parchment, terrain, city markers and the trail.
  const artMode = mapImageUrl !== null;

  return (
    <div className={className}>
      <div className="relative w-full">
        {artMode && (
          <img
            src={mapImageUrl}
            alt=""
            aria-hidden
            width={768}
            height={384}
            className="pixelated block h-auto w-full"
          />
        )}
        <svg
          role="img"
          aria-label={label}
          viewBox={`0 0 ${MAP_GRID_W} ${MAP_GRID_H}`}
          shapeRendering="crispEdges"
          className={artMode ? 'absolute inset-0 h-full w-full' : 'block h-auto w-full'}
        >
          {!artMode && (
            <>
              {/* Parchment with a darker frame — the map is a deliberate light spot. */}
              <rect x={0} y={0} width={MAP_GRID_W} height={MAP_GRID_H} fill="var(--map-frame)" />
              <rect
                x={1.5}
                y={1.5}
                width={MAP_GRID_W - 3}
                height={MAP_GRID_H - 3}
                fill="var(--map-parchment)"
              />
            </>
          )}

          {!artMode &&
            resolved.decor.map((piece, index) => (
            <g key={`decor-${index}`} opacity={0.5} fill="var(--map-ink)">
              {DECOR_CELLS[piece.kind].map(([dx, dy]) => (
                <rect key={`${dx}-${dy}`} x={piece.x + dx} y={piece.y + dy} width={1} height={1} />
              ))}
            </g>
          ))}

          {/* In art mode the remaining trail is drawn by the artwork; the SVG
              adds only the walked (green) part on top of it. */}
          {dots.map((dot, index) =>
            dot.walked ? (
              <rect
                key={`dot-${index}`}
                x={dot.x - 0.8}
                y={dot.y - 0.8}
                width={1.6}
                height={1.6}
                fill="var(--map-trail-walked)"
              />
            ) : artMode ? null : (
              <rect
                key={`dot-${index}`}
                x={dot.x - 0.6}
                y={dot.y - 0.6}
                width={1.2}
                height={1.2}
                fill="var(--map-trail)"
              />
            ),
          )}

          {route.map((point, index) => {
            const position = positions.get(point.city);
            if (!position) return null;
            const isFinish = index === route.length - 1;
            const passed = point.km <= walkedKm;

            return (
              <g key={point.city}>
                <title>{`${point.city} — ${point.km} км`}</title>
                {artMode ? null : isFinish ? (
                  <g fill="var(--map-trail)">
                    {FINISH_CELLS.map(([dx, dy]) => (
                      <rect
                        key={`${dx}-${dy}`}
                        x={position.x + dx - 0.5}
                        y={position.y + dy - 0.5}
                        width={1}
                        height={1}
                      />
                    ))}
                  </g>
                ) : passed ? (
                  <rect
                    x={position.x - 1.5}
                    y={position.y - 1.5}
                    width={3}
                    height={3}
                    fill="var(--map-ink)"
                  />
                ) : (
                  // Future city: an outlined dot — parchment core, ink border.
                  <>
                    <rect
                      x={position.x - 1.5}
                      y={position.y - 1.5}
                      width={3}
                      height={3}
                      fill="var(--map-ink)"
                    />
                    <rect
                      x={position.x - 0.5}
                      y={position.y - 0.5}
                      width={1}
                      height={1}
                      fill="var(--map-parchment)"
                    />
                  </>
                )}
                {labelled.has(point.city) && (
                  <text
                    /* Clamp by the estimated half-width of the label so long
                       names near the frame are not cut (≈1 unit per char). */
                    x={Math.max(
                      point.city.length + 2,
                      Math.min(MAP_GRID_W - point.city.length - 2, position.x),
                    )}
                    y={position.y + (position.y > MAP_GRID_H - 9 ? -3.4 : 5.6)}
                    textAnchor="middle"
                    fontSize={3.4}
                    fontFamily="var(--font-ui)"
                    fill="var(--map-ink)"
                    /* A parchment halo keeps labels readable over artwork. */
                    stroke="var(--map-parchment)"
                    strokeWidth={0.5}
                    paintOrder="stroke"
                    /* Labels are readable data — no crispEdges distortion. */
                    shapeRendering="auto"
                  >
                    {point.city}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* The same walker sprite as on the walk screen (spec § 6.12.5); the
            overlay keeps its CSS step animation outside the SVG. */}
        {marker && (
          <div
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              left: `${(marker.x / MAP_GRID_W) * 100}%`,
              top: `${(marker.y / MAP_GRID_H) * 100}%`,
              transform: 'translate(-50%, -88%)',
            }}
          >
            <WalkerSprite speedKmh={4} size={32} />
          </div>
        )}
      </div>
    </div>
  );
}
