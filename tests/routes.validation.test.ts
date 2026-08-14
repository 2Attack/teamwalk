import { describe, expect, it } from 'vitest';

import { positionOnRoute, ROUTE } from '@/lib/hints/route';
import {
  activateRouteSchema,
  createRouteSchema,
  generateRouteSchema,
  patchRouteSchema,
  routePointsSchema,
} from '@/lib/validation';

/** Route management rules (spec § 6.12.2) — shared by the UI and the API. */

const POINTS = [
  { city: 'Ярославль', km: 0 },
  { city: 'Москва', km: 265 },
  { city: 'Минск', km: 995 },
];

describe('routePointsSchema', () => {
  it('accepts a valid list and normalizes city names', () => {
    const parsed = routePointsSchema.parse([
      { city: '  Ярославль ', km: 0 },
      { city: 'Нижний   Новгород', km: 340 },
    ]);
    expect(parsed[1].city).toBe('Нижний Новгород');
  });

  it('requires the start point at km 0', () => {
    expect(
      routePointsSchema.safeParse([
        { city: 'Москва', km: 10 },
        { city: 'Минск', km: 700 },
      ]).success,
    ).toBe(false);
  });

  it('requires strictly increasing km', () => {
    expect(
      routePointsSchema.safeParse([
        { city: 'Ярославль', km: 0 },
        { city: 'Москва', km: 265 },
        { city: 'Минск', km: 265 },
      ]).success,
    ).toBe(false);
  });

  it('rejects duplicate cities case-insensitively', () => {
    expect(
      routePointsSchema.safeParse([
        { city: 'Ярославль', km: 0 },
        { city: 'ярославль', km: 100 },
      ]).success,
    ).toBe(false);
  });

  it('rejects fewer than 2 and more than 20 points', () => {
    expect(routePointsSchema.safeParse([{ city: 'Ярославль', km: 0 }]).success).toBe(false);
    const many = Array.from({ length: 21 }, (_, i) => ({ city: `Город ${i}`, km: i * 10 }));
    expect(routePointsSchema.safeParse(many).success).toBe(false);
  });

  it('rejects negative and non-integer km', () => {
    expect(
      routePointsSchema.safeParse([
        { city: 'Ярославль', km: 0 },
        { city: 'Москва', km: 265.5 },
      ]).success,
    ).toBe(false);
  });
});

describe('create/patch/activate schemas', () => {
  it('createRouteSchema accepts a full route', () => {
    expect(createRouteSchema.safeParse({ name: 'На запад', points: POINTS }).success).toBe(true);
  });

  it('patchRouteSchema rejects an empty patch', () => {
    expect(patchRouteSchema.safeParse({}).success).toBe(false);
    expect(patchRouteSchema.safeParse({ name: 'Новое имя' }).success).toBe(true);
  });

  it('activateRouteSchema requires an explicit resetProgress', () => {
    expect(activateRouteSchema.safeParse({}).success).toBe(false);
    expect(activateRouteSchema.safeParse({ resetProgress: true }).success).toBe(true);
  });

  it('generateRouteSchema trims and bounds the prompt', () => {
    expect(generateRouteSchema.safeParse({ prompt: '  до Токио  ' }).success).toBe(true);
    expect(generateRouteSchema.safeParse({ prompt: 'аб' }).success).toBe(false);
  });
});

describe('positionOnRoute (points as an argument since spec § 6.12.2)', () => {
  it('projects km onto the given points', () => {
    const position = positionOnRoute(POINTS, 300);
    expect(position.passed.city).toBe('Москва');
    expect(position.next?.city).toBe('Минск');
    expect(position.kmLeft).toBe(695);
  });

  it('finishes the route at the last point', () => {
    const position = positionOnRoute(POINTS, 10_000);
    expect(position.next).toBeNull();
    expect(position.progressRatio).toBe(1);
  });

  it('falls back to the static ROUTE when points are degenerate', () => {
    const position = positionOnRoute([], 0);
    expect(position.passed.city).toBe(ROUTE[0].city);
  });
});
