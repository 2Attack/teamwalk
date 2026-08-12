'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/8bit/button';
import { Icon } from '@/components/ui/icon';
import { apiSend } from '@/lib/client/api';
import { MIN_SPEED_KMH } from '@/lib/config';
import type { ActiveWalkDto } from '@/lib/types';

/**
 * Смена скорости прямо во время прогулки (п. 6.3): «− 4 км/ч +».
 *
 * Шаг ровно 1 км/ч и две крупные кнопки вместо ряда всех скоростей: на планшете
 * у дорожки это одно нажатие вслепую, а прибавляют темп обычно на единицу.
 * Ряд `SpeedPicker` остаётся на старте, где скорость выбирают с нуля.
 *
 * Значение на экране меняется сразу, не дожидаясь ответа: человек сверяет его с
 * табло дорожки. Если запрос не прошёл — возвращаемся к тому, что знает сервер,
 * и говорим об этом: молча разойтись с дорожкой хуже, чем показать ошибку.
 */

interface SpeedControlProps {
  walkId: string;
  /** Текущая скорость по данным сервера. */
  speedKmh: number;
  /** Потолок дорожки (п. 6.9.3). */
  maxSpeedKmh: number;
  /** Прогулка с новым отрезком: по ней экран пересчитывает дистанцию. */
  onChanged: (walk: ActiveWalkDto) => void;
  disabled?: boolean;
}

export function SpeedControl({
  walkId,
  speedKmh,
  maxSpeedKmh,
  onChanged,
  disabled = false,
}: SpeedControlProps) {
  /** Оптимистичное значение; `null` — показываем серверное. */
  const [draft, setDraft] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Куда хотим прийти. Обновляется нажатиями, пока запрос в пути. */
  const target = useRef<number | null>(null);
  const sending = useRef(false);

  const min = MIN_SPEED_KMH;
  const max = Math.max(min, Math.floor(maxSpeedKmh));
  const shown = draft ?? speedKmh;

  // Сервер догнал оптимистичное значение — локальная подмена больше не нужна.
  useEffect(() => {
    if (draft !== null && draft === speedKmh && target.current === null) setDraft(null);
  }, [draft, speedKmh]);

  /**
   * Отправка с очередью: пока ответ в пути, новые нажатия только двигают цель.
   * Три быстрых нажатия «+» дают один-два отрезка вместо трёх — история смен
   * остаётся читаемой, а лишние отрезки нулевой длины не появляются вовсе.
   */
  async function flush() {
    if (sending.current) return;
    sending.current = true;
    try {
      while (target.current !== null) {
        const value = target.current;
        try {
          const walk = await apiSend<ActiveWalkDto>('POST', `/api/walks/${walkId}/speed`, {
            speedKmh: value,
          });
          // Цель могли сдвинуть, пока шёл запрос, — тогда идём на второй круг.
          if (target.current === value) target.current = null;
          onChanged(walk);
        } catch (err: unknown) {
          target.current = null;
          setDraft(null);
          setError(
            err instanceof Error && err.message
              ? err.message
              : 'Не вышло сменить скорость — проверьте связь',
          );
          break;
        }
      }
    } finally {
      sending.current = false;
    }
  }

  function bump(delta: number) {
    const next = Math.min(max, Math.max(min, shown + delta));
    if (next === shown || disabled) return;
    setDraft(next);
    setError(null);
    target.current = next;
    void flush();
  }

  return (
    <section className="flex flex-col items-center gap-2">
      <div className="flex items-center justify-center gap-4">
        <Button
          type="button"
          variant="outline"
          aria-label="Сбросить скорость на 1 км/ч"
          disabled={disabled || shown <= min}
          onClick={() => bump(-1)}
          className="h-auto min-h-14 w-16 px-0"
        >
          <Icon name="minus" size={16} />
        </Button>

        {/* Число — «идентичность», поэтому пиксельный шрифт (п. 6.7.1).
            aria-live: значение меняется без перезагрузки экрана. */}
        <p
          aria-live="polite"
          className="min-w-28 text-center font-pixel text-[24px] leading-none tabular-nums text-text-main"
        >
          {shown}
          <span className="ml-2 text-[12px] text-text-dim">км/ч</span>
        </p>

        <Button
          type="button"
          variant="outline"
          aria-label="Прибавить скорость на 1 км/ч"
          disabled={disabled || shown >= max}
          onClick={() => bump(1)}
          className="h-auto min-h-14 w-16 px-0"
        >
          <Icon name="plus" size={16} />
        </Button>
      </div>

      {/* Подпись читают — обычный sans (п. 6.7.1). */}
      <p className="text-sm text-text-dim">скорость дорожки</p>

      {error !== null ? (
        <p role="alert" className="text-center text-sm text-citrus">
          {error}
        </p>
      ) : null}
    </section>
  );
}
