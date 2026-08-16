'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/cn';
import { m } from '@/lib/i18n';
import { playCountGo, playCountTick } from '@/lib/client/sound';

/**
 * Full-screen "3 → 2 → 1 → GO!" countdown shown after pressing «Start walk».
 * The walk is NOT created until "GO!": `onGo` fires exactly once at
 * that moment, so `started_at` matches the second the person actually starts
 * walking, and cancelling mid-countdown costs nothing — the server has seen
 * nothing yet. The overlay stays mounted through "GO!" (covering the network
 * round-trip and navigation); the parent unmounts it on error.
 *
 * The whole overlay is a single button: any tap (or Esc) cancels while digits
 * are running. Digits are aria-hidden — a screen reader gets one calm label
 * instead of a rapid "3, 2, 1" chatter.
 */

const DIGITS = ['3', '2', '1'] as const;

/** One step ≈ a metronome beat: slow enough to read, fast enough not to annoy. */
const STEP_MS = 800;

interface StartCountdownProps {
  /** Fired once when the countdown reaches "GO!". */
  onGo: () => void;
  /** Tap/Esc before "GO!"; never fired after `onGo`. */
  onCancel: () => void;
}

export function StartCountdown({ onGo, onCancel }: StartCountdownProps) {
  const [step, setStep] = useState(0);
  const isGo = step === DIGITS.length;

  // Latest-ref pattern: the effects below depend only on `step`, so parent
  // re-renders (its handlers are recreated every render) don't re-fire them.
  const onGoRef = useRef(onGo);
  const onCancelRef = useRef(onCancel);
  onGoRef.current = onGo;
  onCancelRef.current = onCancel;

  // Advance the digit; the timer restarts per step and dies with the overlay.
  useEffect(() => {
    if (isGo) return;
    const timer = window.setTimeout(() => setStep((prev) => prev + 1), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [step, isGo]);

  // Sound per step + the single `onGo`. Sound is allowed here by the same
  // precedent as the achievement fanfare: it always follows an explicit user
  // gesture (the start button), is synthesized quietly and never plays from a
  // background tab (see lib/client/sound.ts).
  const goFired = useRef(false);
  useEffect(() => {
    if (!isGo) {
      playCountTick();
      return;
    }
    playCountGo();
    if (!goFired.current) {
      goFired.current = true;
      onGoRef.current();
    }
  }, [step, isGo]);

  // Move focus into the overlay so Esc works without an extra Tab.
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  const cancel = () => {
    // After "GO!" the request is already in flight — nothing to cancel.
    if (!isGo) onCancelRef.current();
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={m.countdown.cancelAria}
      onClick={cancel}
      onKeyDown={(event) => {
        if (event.key === 'Escape') cancel();
      }}
      className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-12 bg-black/85"
    >
      <span aria-hidden className="relative flex items-center justify-center">
        {/* key={step} restarts both CSS animations on every digit change. */}
        <span
          key={`ring-${step}`}
          className={cn(
            'animate-count-ring absolute -inset-8 border-[3px] sm:-inset-10',
            isGo ? 'border-lime' : 'border-citrus',
          )}
        />
        <span
          key={step}
          className={cn(
            'animate-count-pop font-pixel leading-none',
            isGo ? 'text-6xl text-lime sm:text-7xl' : 'text-8xl text-citrus sm:text-9xl',
          )}
        >
          {isGo ? m.countdown.go : DIGITS[step]}
        </span>
      </span>
      <span className="font-pixel text-[10px] leading-relaxed text-text-dim">
        {isGo ? m.countdown.starting : m.countdown.tapToCancel}
      </span>
    </button>
  );
}
