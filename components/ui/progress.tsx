/**
 * Полоса прогресса из дискретных сегментов — «энергошкала» аркадного табло
 * (собственный слой в стилистике 8bitcn/ui + SNES.css, п. 6.7.4).
 *
 * Сегменты вместо плавной заливки: ширина блоков не анимируется вообще, поэтому
 * нет reflow — ограничение п. 6.7.6 соблюдено по построению.
 */
import type * as React from 'react';

import { cn } from '@/lib/cn';

/** 20 делений: читается как шкала, но не рассыпается в кашу на 360px. */
const SEGMENTS = 20;

export interface ProgressProps {
  value: number;
  max?: number;
  className?: string;
  /** Доступное имя для role="progressbar". */
  label?: string;
}

export function Progress({
  value,
  max = 100,
  className,
  label = 'Прогресс',
}: ProgressProps): React.JSX.Element {
  // Данные приходят из API и с сервера: NaN и max ≤ 0 надёжнее погасить здесь.
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const safeValue = Number.isFinite(value) ? Math.min(Math.max(value, 0), safeMax) : 0;
  const ratio = safeValue / safeMax;
  const filled = Math.round(ratio * SEGMENTS);
  const percent = Math.round(ratio * 100);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={safeValue}
      aria-valuetext={`${percent}%`}
      className={cn(
        'flex h-6 w-full gap-[2px] rounded-none border-[3px] border-border-dim bg-bg-deep p-[2px]',
        className,
      )}
    >
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={cn('h-full flex-1', i < filled ? 'bg-citrus' : 'bg-border-dim')}
        />
      ))}
    </div>
  );
}
