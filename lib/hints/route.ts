import { ROUTE_HOME_CITY } from '@/lib/config';
import type { RouteCityDto } from '@/lib/types';

/**
 * Виртуальный маршрут Ярославль → Лиссабон (п. 6.6.8 ТЗ): на него проецируется
 * суммарная дистанция команды. По одному городу на страну (Россия — старт плюс
 * Москва); `km` — накопительное
 * расстояние от старта по автодорогам (округлено до десятков). Стартовый город —
 * константа из конфига: если офис не в Ярославле, меняется одна строка.
 */
export const ROUTE: RouteCityDto[] = [
  { city: ROUTE_HOME_CITY, km: 0 }, // Россия — старт
  { city: 'Москва', km: 265 }, // Россия
  { city: 'Минск', km: 995 }, // Беларусь
  { city: 'Варшава', km: 1540 }, // Польша
  { city: 'Берлин', km: 2120 }, // Германия
  { city: 'Брюссель', km: 2915 }, // Бельгия
  { city: 'Париж', km: 3225 }, // Франция
  { city: 'Мадрид', km: 4495 }, // Испания
  { city: 'Лиссабон', km: 5120 }, // Португалия
];

export interface RoutePosition {
  passed: RouteCityDto;
  next: RouteCityDto | null;
  kmLeft: number;
  /** Доля отрезка между `passed` и `next`, 0…1. */
  progressRatio: number;
}

/** Позиция команды на маршруте. Арифметику делаем мы, а не LLM (п. 6.6.8). */
export function positionOnRoute(totalKm: number): RoutePosition {
  const km = Math.max(0, totalKm);
  let passedIndex = 0;
  for (let i = 0; i < ROUTE.length; i += 1) {
    if (km >= ROUTE[i].km) passedIndex = i;
  }

  const passed = ROUTE[passedIndex];
  const next = ROUTE[passedIndex + 1] ?? null;

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
