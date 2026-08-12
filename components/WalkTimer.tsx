'use client';

import { useEffect, useMemo, useState } from 'react';

import { Progress } from '@/components/ui/8bit/progress';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { calcSegmentedDistanceKm, formatDuration, formatKm } from '@/lib/format';
import type { WalkSpeedSegmentDto } from '@/lib/types';

/**
 * Таймер активной прогулки (п. 6.3).
 *
 * Единственный источник истины — `startedAt` с сервера: значение всегда равно
 * `Date.now() − startedAt`, а `setInterval` только перерисовывает его. Поэтому
 * перезагрузка страницы, свёрнутая вкладка, уснувший планшет и открытие на другом
 * устройстве дают одинаковое время: накопительного счётчика, который мог бы
 * отстать, в коде нет вообще.
 */

function elapsedSince(startedAtMs: number): number {
  return Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
}

/** Секунды с момента старта; пересчитывается от часов, а не накоплением. */
export function useElapsedSeconds(startedAt: string): number {
  const startedAtMs = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const [seconds, setSeconds] = useState(() => elapsedSince(startedAtMs));

  useEffect(() => {
    // Пересчёт по событиям возврата: в фоне интервал троттлится браузером,
    // и без этого первое видимое значение после пробуждения было бы устаревшим.
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
  /** ISO-время старта, полученное с сервера. */
  startedAt: string;
  /** Текущая скорость — её и подписываем под счётчиком. */
  speedKmh: number;
  /**
   * Отрезки скорости с сервера. Дистанция растёт по ним, а не по одной скорости:
   * смена темпа на ходу не переписывает уже пройденное (п. 6.3).
   */
  speedSegments: WalkSpeedSegmentDto[];
  /** Личный рекорд дня, км. `null` — рекорда ещё нет. */
  bestDayKm?: number | null;
  className?: string;
}

export function WalkTimer({
  startedAt,
  speedKmh,
  speedSegments,
  bestDayKm,
  className,
}: WalkTimerProps) {
  const seconds = useElapsedSeconds(startedAt);
  // Конец берём от того же `seconds`, а не от `Date.now()`: иначе счётчик
  // дистанции жил бы по своим часам и мог разойтись с таймером на секунду.
  const endMs = new Date(startedAt).getTime() + seconds * 1000;
  // Та же функция, что предзаполняет модалку завершения, — значения совпадают.
  const distanceKm = calcSegmentedDistanceKm(speedSegments, endMs);
  const speedChanged = speedSegments.length > 1;
  const hasRecord = typeof bestDayKm === 'number' && bestDayKm > 0;
  const beatsRecord = hasRecord && distanceKm > bestDayKm;
  // 8bitcn Progress считает шкалу в процентах, поэтому долю считаем здесь.
  const recordPercent = hasRecord ? Math.min(100, Math.round((distanceKm / bestDayKm) * 100)) : 0;

  return (
    <section className={cn('flex flex-col items-center gap-4 text-center', className)}>
      {/* Пиксельный шрифт только на числах и коротких метках (п. 6.7.1). */}
      <p
        className="font-pixel text-[32px] leading-none tabular-nums text-text-main sm:text-[48px]"
        aria-label={`Прошло ${formatDuration(seconds)}`}
        role="timer"
      >
        {formatDuration(seconds)}
      </p>

      <div>
        <p className="font-pixel text-[24px] leading-none tabular-nums text-citrus sm:text-[32px]">
          {formatKm(distanceKm)} км
        </p>
        {/* Подпись читают — обычный sans. */}
        {/* После смены темпа «при 6 км/ч» врало бы: часть пути пройдена иначе. */}
        <p className="mt-2 text-sm text-text-dim">
          {speedChanged ? `набежало · сейчас ${speedKmh} км/ч` : `набежало при ${speedKmh} км/ч`}
        </p>
      </div>

      {hasRecord ? (
        <div className="w-full px-1.5">
          {beatsRecord ? (
            <p className="flex items-center justify-center gap-2 font-pixel text-[16px] leading-tight text-lime">
              <Icon name="trophy" size={16} />
              НОВЫЙ РЕКОРД
            </p>
          ) : (
            <>
              <Progress
                value={recordPercent}
                variant="retro"
                font="normal"
                progressBg="bg-lime"
                className="h-4"
                aria-label={`Прогресс к лучшему дню: ${formatKm(distanceKm)} из ${formatKm(bestDayKm)} км`}
              />
              <p className="mt-3 text-sm text-text-dim">
                твой лучший день — {formatKm(bestDayKm)} км
              </p>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
