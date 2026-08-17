'use client';

import { useEffect, useId, useState } from 'react';

import { Button } from '@/components/ui/8bit/button';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { elapsedSec, formatDuration } from '@/lib/format';
import { fmt, m } from '@/lib/i18n';
import type { TreadmillBusyDto, TreadmillDto } from '@/lib/types';

interface TreadmillPickerProps {
  treadmills: TreadmillDto[];
  value: string | null;
  onChange: (treadmillId: string) => void;
}

/**
 * Treadmill picker. Renders **only with two or more active
 * treadmills** — no feature flags: add a DB row and the picker appears.
 *
 * Buttons use `font="normal"`: name and busy line are data, and
 * «занята: Константин Верещагин, идёт 14:32» in pixel font doesn't fit
 * the column.
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
              // A busy treadmill can't be selected: someone is physically on it.
              disabled={busy !== null}
              variant={selected && !busy ? 'default' : 'outline'}
              onClick={() => onChange(treadmill.id)}
              className={cn(
                'h-auto min-h-11 w-full flex-col items-start gap-1 px-3 py-2.5 text-left whitespace-normal',
                // Stock `disabled:opacity-50` would push the name and timer
                // below 4.5:1 contrast, and those must stay readable.
                // Dim only the pixel frame instead.
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

/** «занята: Егор, идёт 14:32» — answers "how long is the wait". */
export function busyLabel(busy: TreadmillBusyDto, now: number): string {
  return fmt(m.treadmillPicker.busyLabel, {
    name: busy.user.name,
    duration: formatDuration(elapsedSec(busy.startedAt, now)),
  });
}

/**
 * One-second tick for live busy timers. The interval runs only when actually
 * needed — the treadmill tablet stays open for hours.
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
