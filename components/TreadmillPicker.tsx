'use client';

import { useEffect, useId, useState } from 'react';

import { Button } from '@/components/ui/8bit/button';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/format';
import { fmt, m } from '@/lib/i18n';
import type { TreadmillBusyDto, TreadmillDto } from '@/lib/types';

interface TreadmillPickerProps {
  treadmills: TreadmillDto[];
  value: string | null;
  onChange: (treadmillId: string) => void;
}

/**
 * Выбор дорожки (п. 6.9.3). Рендерится **только при двух и более активных
 * дорожках** — никаких фиче-флагов: добавили запись в БД, селектор появился сам.
 *
 * Кнопки с `font="normal"`: название дорожки и строка занятости — данные, их
 * читают, и «занята: Константин Верещагин, идёт 14:32» пиксельным шрифтом
 * не помещается в колонку (п. 6.7.1).
 */
export function TreadmillPicker({ treadmills, value, onChange }: TreadmillPickerProps) {
  const labelId = useId();
  const now = useNowTick(treadmills.some((t) => t.busy !== null));

  if (treadmills.length < 2) return null;

  const ordered = [...treadmills].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-2">
      <p id={labelId} className="text-sm text-text-dim">
        {m.treadmillPicker.label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="grid gap-3 sm:grid-cols-2"
      >
        {ordered.map((treadmill) => {
          const busy = treadmill.busy;
          const selected = treadmill.id === value;
          return (
            <Button
              key={treadmill.id}
              type="button"
              role="radio"
              aria-checked={selected}
              font="normal"
              // Занятую дорожку выбрать нельзя: на ней физически кто-то идёт (п. 6.9.3).
              disabled={busy !== null}
              variant={selected && !busy ? 'default' : 'outline'}
              onClick={() => onChange(treadmill.id)}
              className={cn(
                'h-auto min-h-11 w-full flex-col items-start gap-1 px-3 py-2.5 text-left whitespace-normal',
                // Штатное `disabled:opacity-50` увело бы имя и таймер ниже
                // контраста 4.5:1, а их как раз и нужно прочитать (п. 8).
                // Вместо этого гасим только пиксельную рамку.
                busy && 'disabled:opacity-100 [&_[data-slot=button-decorations]>span]:opacity-40',
              )}
            >
              <span className="text-sm leading-tight font-medium">{treadmill.name}</span>
              <span
                className={cn(
                  'flex items-center gap-1.5 text-xs leading-snug',
                  selected && !busy ? 'text-primary-foreground/80' : 'text-text-dim',
                )}
              >
                {busy && <Icon name="clock" size={16} />}
                {busy ? busyLabel(busy, now) : fmt(m.treadmillPicker.capUpTo, { max: treadmill.maxSpeedKmh })}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

/** «занята: Егор, идёт 14:32» — answers "how long is the wait" (spec § 6.9.3). */
export function busyLabel(busy: TreadmillBusyDto, now: number): string {
  return fmt(m.treadmillPicker.busyLabel, {
    name: busy.user.name,
    duration: formatDuration(elapsedSec(busy.startedAt, now)),
  });
}

/** Прошло секунд с момента старта; отрицательные значения гасятся до нуля. */
export function elapsedSec(startedAtIso: string, now: number): number {
  const started = new Date(startedAtIso).getTime();
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, Math.floor((now - started) / 1000));
}

/**
 * Тик раз в секунду для живых таймеров занятости.
 * Интервал заводится только когда он реально нужен — планшет у дорожки
 * висит открытым часами, лишний таймер ему ни к чему (п. 8).
 */
export function useNowTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  return now;
}
