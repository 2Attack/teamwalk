import type { RouteCityDto } from '@/lib/types';

/**
 * Static fallback route Ярославль → Лиссабон (spec § 6.6.8, 6.12.6). Since
 * spec § 6.12 the source of truth is the `routes` table; this constant remains
 * in two roles — the seed of the first migration and the fallback for an empty
 * table (the same degradation shape as hints without LLM keys). One city per
 * country (Russia gets the start plus Москва); `km` is the cumulative road
 * distance from the start, rounded to tens.
 */
export const ROUTE: RouteCityDto[] = [
  { city: 'Ярославль', km: 0 }, // Russia — start
  { city: 'Москва', km: 265 }, // Russia
  { city: 'Минск', km: 995 }, // Belarus
  { city: 'Варшава', km: 1540 }, // Poland
  { city: 'Берлин', km: 2120 }, // Germany
  { city: 'Брюссель', km: 2915 }, // Belgium
  { city: 'Париж', km: 3225 }, // France
  { city: 'Мадрид', km: 4495 }, // Spain
  { city: 'Лиссабон', km: 5120 }, // Portugal
];

export interface RoutePosition {
  passed: RouteCityDto;
  next: RouteCityDto | null;
  kmLeft: number;
  /** Fraction of the segment between `passed` and `next`, 0…1. */
  progressRatio: number;
}

/**
 * Team position on a route. Pure over its inputs since spec § 6.12.2: the
 * points come from the active DB route (or the ROUTE fallback), and the
 * arithmetic is ours, not the LLM's (spec § 6.6.8).
 */
export function positionOnRoute(points: RouteCityDto[], totalKm: number): RoutePosition {
  const route = points.length >= 2 ? points : ROUTE;
  const km = Math.max(0, totalKm);
  let passedIndex = 0;
  for (let i = 0; i < route.length; i += 1) {
    if (km >= route[i].km) passedIndex = i;
  }

  const passed = route[passedIndex];
  const next = route[passedIndex + 1] ?? null;

  if (!next) return { passed, next: null, kmLeft: 0, progressRatio: 1 };

  const segment = next.km - passed.km;
  const walked = km - passed.km;
  return {
    passed,
    next,
    kmLeft: Math.round((next.km - km) * 100) / 100,
    progressRatio: segment > 0 ? Math.min(1, Math.max(0, walked / segment)) : 0,
  };
}
