'use client';

import { Badge } from '@/components/ui/8bit/badge';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';

interface StreakBadgeProps {
  days: number;
  className?: string;
}

/** Порог «горячей» серии (п. 6.8.2): с пяти рабочих дней подряд — отдельная подсветка. */
const HOT_STREAK_DAYS = 5;

/**
 * Значок серии рядом с именем (п. 6.8.2) — `Badge` из 8bitcn.
 *
 * Состояние передаётся вариантом библиотеки, а не своими цветами: `default` —
 * цитрусовая заливка «горячей» серии, `secondary` — обычная, `outline` — нулевая.
 * Нулевая серия не исчезает, а гаснет: пустое место в колонке читается как ошибка
 * загрузки, приглушённый ноль — как факт.
 *
 * `font` оставлен пиксельным (дефолт библиотеки): внутри только иконка и число —
 * это слой идентичности, а не данных (п. 6.7.1).
 */
export function StreakBadge({ days, className }: StreakBadgeProps) {
  const safeDays = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;
  const isHot = safeDays >= HOT_STREAK_DAYS;

  const label =
    safeDays === 0
      ? 'Серии пока нет'
      : `Серия: ${safeDays} ${plural(safeDays, 'день', 'дня', 'дней')} подряд`;

  return (
    <Badge
      role="img"
      aria-label={label}
      title={label}
      variant={isHot ? 'default' : safeDays === 0 ? 'outline' : 'secondary'}
      /*
        Badge из 8bitcn раскладывает className сам: `text-*`/`bg-*`/`border-*`
        уходят на саму плашку и боковые пиксельные планки, всё остальное —
        на контейнер. Поэтому размер задаём контейнеру (`min-h-7`), а кегль —
        визуальным классом; `mx-1.5` оставляет место планкам по бокам.
      */
      className={cn('mx-1.5 min-h-7 align-middle', 'text-[16px]', className)}
    >
      {/* Иконка из общего пиксельного набора (п. 6.7.4), смысл несёт aria-label. */}
      <Icon name="flame" size={16} />
      <span className="tabular-nums">{safeDays}</span>
    </Badge>
  );
}
