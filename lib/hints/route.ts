import type { RouteCityDto } from '@/lib/types';

/**
 * Team position math (spec § 6.6.8, 6.12). The route lives in the `routes`
 * table only — the former hardcoded fallback is retired: an empty table is the
 * legitimate "no route selected" state, and callers must guard for it
 * (`points.length >= 2`) before projecting a position.
 */

export interface RoutePosition {
  passed: RouteCityDto;
  next: RouteCityDto | null;
  kmLeft: number;
  /** Fraction of the segment between `passed` and `next`, 0…1. */
  progressRatio: number;
}

/**
 * Team position on a route. Pure over its inputs; the arithmetic is ours, not
 * the LLM's (spec § 6.6.8). Expects a non-empty points list — callers with a
 * possibly empty route check that themselves.
 */
export function positionOnRoute(points: RouteCityDto[], totalKm: number): RoutePosition {
  const start = points[0] ?? { city: '', km: 0 };
  const km = Math.max(0, totalKm);
  let passedIndex = 0;
  for (let i = 0; i < points.length; i += 1) {
    if (km >= points[i].km) passedIndex = i;
  }

  const passed = points[passedIndex] ?? start;
  const next = points[passedIndex + 1] ?? null;

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
