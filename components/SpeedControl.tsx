'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/8bit/button';
import { Icon } from '@/components/ui/icon';
import { apiSend } from '@/lib/client/api';
import { MIN_SPEED_KMH } from '@/lib/config';
import { m } from '@/lib/i18n';
import type { ActiveWalkDto } from '@/lib/types';

/**
 * Mid-walk speed change (spec § 6.3): «− 4 km/h +».
 *
 * Step of exactly 1 km/h and two big buttons instead of the full speed row:
 * on a treadmill tablet this is one blind tap, and pace usually changes by one.
 * The `SpeedPicker` row stays on the start screen where speed is picked from scratch.
 *
 * The value updates optimistically — the user checks it against the treadmill
 * display. While the request is in flight both buttons are disabled and the
 * pressed one blinks a clock, so impatient taps don't spawn extra segments.
 * On failure we revert to the server's value and say so: silently diverging
 * from the treadmill is worse than showing an error.
 */

interface SpeedControlProps {
  walkId: string;
  /** Current speed as known by the server. */
  speedKmh: number;
  /** Treadmill speed cap (spec § 6.9.3). */
  maxSpeedKmh: number;
  /** Walk with the new segment; the screen recomputes distance from it. */
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
  /** Optimistic value; `null` — show the server's. */
  const [draft, setDraft] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Request in flight: buttons disabled, the pressed one blinks a clock. */
  const [pending, setPending] = useState(false);
  const [pendingDelta, setPendingDelta] = useState<-1 | 1 | null>(null);
  // Guard against a double call before re-render: state updates are async.
  const sending = useRef(false);

  const min = MIN_SPEED_KMH;
  const max = Math.max(min, Math.floor(maxSpeedKmh));
  const shown = draft ?? speedKmh;

  // The server caught up with the optimistic value — drop the local override.
  useEffect(() => {
    if (draft !== null && draft === speedKmh && !sending.current) setDraft(null);
  }, [draft, speedKmh]);

  async function send(value: number) {
    sending.current = true;
    setPending(true);
    try {
      const walk = await apiSend<ActiveWalkDto>('POST', `/api/walks/${walkId}/speed`, {
        speedKmh: value,
      });
      onChanged(walk);
    } catch (err: unknown) {
      setDraft(null);
      setError(
        err instanceof Error && err.message
          ? err.message
          : m.speedControl.changeFailed,
      );
    } finally {
      sending.current = false;
      setPending(false);
      setPendingDelta(null);
    }
  }

  function bump(delta: -1 | 1) {
    const next = Math.min(max, Math.max(min, shown + delta));
    if (next === shown || disabled || sending.current) return;
    setDraft(next);
    setError(null);
    setPendingDelta(delta);
    void send(next);
  }

  return (
    <section className="flex flex-col items-center gap-2">
      <div className="flex items-center justify-center gap-4">
        <Button
          type="button"
          variant="outline"
          aria-label={m.speedControl.decreaseAria}
          disabled={disabled || pending || shown <= min}
          onClick={() => bump(-1)}
          className="h-auto min-h-14 w-16 px-0"
        >
          {pendingDelta === -1 ? (
            <Icon name="clock" size={16} className="animate-blink" />
          ) : (
            <Icon name="minus" size={16} />
          )}
        </Button>

        {/* Number is identity layer — pixel font (spec § 6.7.1).
            aria-live: the value changes without a screen reload. */}
        <p
          aria-live="polite"
          className="min-w-28 text-center font-pixel text-[24px] leading-none tabular-nums text-text-main"
        >
          {shown}
          <span className="ml-2 text-[12px] text-text-dim">{m.units.kmh}</span>
        </p>

        <Button
          type="button"
          variant="outline"
          aria-label={m.speedControl.increaseAria}
          disabled={disabled || pending || shown >= max}
          onClick={() => bump(1)}
          className="h-auto min-h-14 w-16 px-0"
        >
          {pendingDelta === 1 ? (
            <Icon name="clock" size={16} className="animate-blink" />
          ) : (
            <Icon name="plus" size={16} />
          )}
        </Button>
      </div>

      {/* Caption is read — regular sans (spec § 6.7.1). */}
      <p className="text-sm text-text-dim">{m.speedControl.caption}</p>

      {error !== null ? (
        <p role="alert" className="text-center text-sm text-citrus">
          {error}
        </p>
      ) : null}
    </section>
  );
}
