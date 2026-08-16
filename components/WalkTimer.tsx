'use client';

import { useEffect, useMemo, useState } from 'react';

import { Progress } from '@/components/ui/8bit/progress';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { calcSegmentedDistanceKm, formatDuration, formatKm } from '@/lib/format';
import { fmt, m } from '@/lib/i18n';
import type { WalkSpeedSegmentDto } from '@/lib/types';

/**
 * Active walk timer (spec § 6.3).
 *
 * The single source of truth is the server's `startedAt`: the value is always
 * `Date.now() − startedAt`, and `setInterval` only repaints it. Page reloads,
 * backgrounded tabs, a sleeping tablet, or another device all show the same
 * time — there is no accumulating counter that could drift.
 */

function elapsedSince(startedAtMs: number): number {
  return Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
}

/** Seconds since start; recomputed from the clock, not accumulated. */
export function useElapsedSeconds(startedAt: string): number {
  const startedAtMs = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const [seconds, setSeconds] = useState(() => elapsedSince(startedAtMs));

  useEffect(() => {
    // Recompute on return events: the browser throttles the interval in the
    // background, so the first visible value after waking would be stale.
    const tick = () => setSeconds(elapsedSince(startedAtMs));
    tick();

    const timer = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    window.addEventListener('pageshow', tick);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
      window.removeEventListener('pageshow', tick);
    };
  }, [startedAtMs]);

  return seconds;
}

interface WalkTimerProps {
  /** ISO start time from the server. */
  startedAt: string;
  /**
   * Speed segments from the server. Distance grows by segments, not one speed:
   * changing pace mid-walk doesn't rewrite what's already covered (spec § 6.3).
   */
  speedSegments: WalkSpeedSegmentDto[];
  /** Personal best day, km. `null` — no record yet. */
  bestDayKm?: number | null;
  className?: string;
}

export function WalkTimer({
  startedAt,
  speedSegments,
  bestDayKm,
  className,
}: WalkTimerProps) {
  const seconds = useElapsedSeconds(startedAt);
  // End derives from the same `seconds`, not `Date.now()`: otherwise the
  // distance counter would run on its own clock and drift from the timer.
  const endMs = new Date(startedAt).getTime() + seconds * 1000;
  // Same function that pre-fills the finish dialog — the values match.
  const distanceKm = calcSegmentedDistanceKm(speedSegments, endMs);
  const hasRecord = typeof bestDayKm === 'number' && bestDayKm > 0;
  const beatsRecord = hasRecord && distanceKm > bestDayKm;
  // 8bitcn Progress works in percent, so the ratio is computed here.
  const recordPercent = hasRecord ? Math.min(100, Math.round((distanceKm / bestDayKm) * 100)) : 0;

  return (
    <section className={cn('flex flex-col items-center gap-4 text-center', className)}>
      {/* Pixel font only on numbers and short labels (spec § 6.7.1). */}
      <p
        className="font-pixel text-[32px] leading-none tabular-nums text-text-main sm:text-[48px]"
        aria-label={fmt(m.walkTimer.elapsedAria, { duration: formatDuration(seconds) })}
        role="timer"
      >
        {formatDuration(seconds)}
      </p>

      {/* No speed caption on purpose: the control below shows the current
          pace, duplicating it was just noise. */}
      <p className="font-pixel text-[24px] leading-none tabular-nums text-citrus sm:text-[32px]">
        {formatKm(distanceKm)} {m.units.km}
      </p>

      {hasRecord ? (
        <div className="w-full px-1.5">
          {beatsRecord ? (
            <p className="flex items-center justify-center gap-2 font-pixel text-[16px] leading-tight text-lime">
              <Icon name="trophy" size={16} />
              {m.walkTimer.newRecord}
            </p>
          ) : (
            <>
              <Progress
                value={recordPercent}
                variant="retro"
                font="normal"
                progressBg="bg-lime"
                className="h-4"
                aria-label={fmt(m.walkTimer.recordProgressAria, { current: formatKm(distanceKm), best: formatKm(bestDayKm) })}
              />
              <p className="mt-3 text-sm text-text-dim">
                {fmt(m.walkTimer.bestDay, { km: formatKm(bestDayKm) })}
              </p>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
