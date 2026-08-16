'use client';

import { useId } from 'react';

import { Button } from '@/components/ui/8bit/button';
import { MIN_SPEED_KMH } from '@/lib/config';
import { fmt, m } from '@/lib/i18n';

interface SpeedPickerProps {
  /** Selected speed; `null` — not chosen yet. */
  value: number | null;
  /** Treadmill cap: the row runs from `MIN_SPEED_KMH` up to it. */
  max: number;
  onChange: (speedKmh: number) => void;
  disabled?: boolean;
}

/**
 * Button row instead of a dropdown: one tap instead of three on
 * the treadmill tablet. Wraps into two rows of five on narrow screens.
 *
 * Numbers are identity layer, so the font stays pixel.
 */
export function SpeedPicker({ value, max, onChange, disabled = false }: SpeedPickerProps) {
  const labelId = useId();
  const speeds = buildSpeeds(max);

  /** Arrows move the selection within the group — like a native radiogroup. */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = arrowStep(event.key);
    if (step === null || disabled || speeds.length === 0) return;
    event.preventDefault();

    const current = value === null ? -1 : speeds.indexOf(value);
    const next =
      step === 'first'
        ? 0
        : step === 'last'
          ? speeds.length - 1
          : clampIndex(current === -1 ? 0 : current + step, speeds.length);

    onChange(speeds[next]);
  }

  return (
    <div className="space-y-2">
      <p id={labelId} className="text-sm text-text-dim">
        {m.speedPicker.label}
      </p>
      {/* gap-3: the 8bitcn pixel frame sticks out 6 px past the button box;
          any smaller gap and adjacent frames would overlap. */}
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={handleKeyDown}
        className="grid grid-cols-5 gap-3 sm:grid-cols-10"
      >
        {speeds.map((speed) => {
          const selected = speed === value;
          return (
            <Button
              key={speed}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={fmt(m.speedPicker.speedAria, { speed })}
              // Roving tabindex: Tab enters the group once, then arrows.
              tabIndex={selected || (value === null && speed === speeds[0]) ? 0 : -1}
              disabled={disabled}
              variant={selected ? 'default' : 'outline'}
              onClick={() => onChange(speed)}
              className="min-h-11 w-full px-0 text-xs"
            >
              {speed}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

/** Whole values from the minimum to the treadmill cap. */
function buildSpeeds(max: number): number[] {
  const top = Math.max(MIN_SPEED_KMH, Math.floor(max));
  return Array.from({ length: top - MIN_SPEED_KMH + 1 }, (_, i) => MIN_SPEED_KMH + i);
}

type ArrowStep = 1 | -1 | 'first' | 'last' | null;

function arrowStep(key: string): ArrowStep {
  if (key === 'ArrowRight' || key === 'ArrowDown') return 1;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return -1;
  if (key === 'Home') return 'first';
  if (key === 'End') return 'last';
  return null;
}

function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(index, 0), length - 1);
}
