/**
 * Progress bar of discrete segments — an arcade "energy gauge"
 * (custom layer in the 8bitcn/ui + SNES.css style).
 *
 * Segments instead of a smooth fill: block widths are never animated, so
 * there is no reflow by construction.
 */
import type * as React from 'react';

import { cn } from '@/lib/cn';

import { m } from '@/lib/i18n';

/** 20 segments: reads as a gauge without turning to mush at 360px. */
const SEGMENTS = 20;

export interface ProgressProps {
  value: number;
  max?: number;
  className?: string;
  /** Accessible name for role="progressbar". */
  label?: string;
}

export function Progress({
  value,
  max = 100,
  className,
  label = m.common.progress,
}: ProgressProps): React.JSX.Element {
  // Data comes from the API/server: safer to neutralize NaN and max <= 0 here.
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
