import { describe, expect, it } from 'vitest';

import { MAP_DECOR_MAX, MAP_GRID_H, MAP_GRID_W } from '@/lib/config';
import { fallbackLayout, normalizeLayout } from '@/lib/map/layout';
import { ROUTE } from '@/lib/hints/route';
import type { MapLayoutDto } from '@/lib/types';

/** Deterministic map layouts (spec § 6.12.5). */

describe('fallbackLayout', () => {
  it('is deterministic for the same route', () => {
    const a = fallbackLayout(ROUTE);
    const b = fallbackLayout(ROUTE);
    expect(a).toEqual(b);
  });

  it('changes with the seed', () => {
    const a = fallbackLayout(ROUTE, 'seed-a');
    const b = fallbackLayout(ROUTE, 'seed-b');
    expect(a.decor).not.toEqual(b.decor);
  });

  it('places every city inside the grid', () => {
    const layout = fallbackLayout(ROUTE);
    expect(layout.cities.map((c) => c.city)).toEqual(ROUTE.map((p) => p.city));
    for (const city of layout.cities) {
      expect(city.x).toBeGreaterThanOrEqual(0);
      expect(city.x).toBeLessThanOrEqual(MAP_GRID_W);
      expect(city.y).toBeGreaterThanOrEqual(0);
      expect(city.y).toBeLessThanOrEqual(MAP_GRID_H);
    }
  });

  it('keeps decor within the cap and off the cities', () => {
    const layout = fallbackLayout(ROUTE);
    expect(layout.decor.length).toBeLessThanOrEqual(MAP_DECOR_MAX);
    for (const piece of layout.decor) {
      for (const city of layout.cities) {
        const d = Math.hypot(city.x - piece.x, city.y - piece.y);
        expect(d).toBeGreaterThanOrEqual(6);
      }
    }
  });
});

describe('normalizeLayout', () => {
  const points = ROUTE.slice(0, 3);
  const good: MapLayoutDto = {
    cities: [
      { city: 'ярославль', x: 10, y: 10 },
      { city: 'Москва', x: 30, y: 20 },
      { city: 'Минск', x: 60, y: 30 },
    ],
    bends: [
      { after: 'Москва', x: 45, y: 26 },
      { after: 'Минск', x: 70, y: 40 }, // after the final city — must be dropped
    ],
    decor: [
      { kind: 'tree', x: 80, y: 10 },
      { kind: 'lake', x: 30, y: 21 }, // on top of a city — must be dropped
    ],
  };

  it('matches cities case-insensitively and keeps route order', () => {
    const layout = normalizeLayout(good, points);
    expect(layout?.cities.map((c) => c.city)).toEqual(points.map((p) => p.city));
  });

  it('drops bends after the final city and decor covering cities', () => {
    const layout = normalizeLayout(good, points);
    expect(layout?.bends).toHaveLength(1);
    expect(layout?.decor).toHaveLength(1);
    expect(layout?.decor[0].kind).toBe('tree');
  });

  it('returns null when a route city is missing', () => {
    const broken = { ...good, cities: good.cities.slice(0, 2) };
    expect(normalizeLayout(broken, points)).toBeNull();
  });

  it('clamps coordinates into the grid and separates clashing cities', () => {
    const clashing: MapLayoutDto = {
      cities: [
        { city: 'Ярославль', x: 500, y: -10 },
        { city: 'Москва', x: 500, y: -10 },
        { city: 'Минск', x: 60, y: 30 },
      ],
      bends: [],
      decor: [],
    };
    const layout = normalizeLayout(clashing, points);
    expect(layout).not.toBeNull();
    const [a, b] = layout!.cities;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(4);
    for (const city of layout!.cities) {
      expect(city.x).toBeLessThanOrEqual(MAP_GRID_W - 4);
      expect(city.y).toBeGreaterThanOrEqual(4);
    }
  });
});
