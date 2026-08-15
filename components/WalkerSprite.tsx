'use client';

/**
 * Walking character — the face of the walk screen (spec § 6.7.6).
 *
 * Sprite sheet: 8 frames of 32×32 → 256×32. The `walk-cycle` keyframes in
 * globals.css shift the background exactly 256px per cycle, so the animated
 * layer is always 1×; scaling is `transform: scale()` on the wrapper —
 * scaling via background-size would break the keyframe step.
 *
 * `prefers-reduced-motion` is handled by global CSS: no separate check here,
 * to avoid diverging from it.
 */

import { cn } from '@/lib/cn';
import { m } from '@/lib/i18n';

const FRAME_PX = 32;
const SHEET_PX = 256;

/** Stepped mapping of stride tempo to speed: no smooth interpolation (spec § 6.7.6). */
function stepDurationSec(speedKmh: number): number {
  // Speed comes from the server: NaN would break the CSS animation entirely.
  if (!Number.isFinite(speedKmh) || speedKmh <= 2) return 1.2;
  if (speedKmh <= 3) return 1;
  if (speedKmh <= 4) return 0.8;
  if (speedKmh <= 5) return 0.65;
  if (speedKmh <= 7) return 0.5;
  return 0.4;
}

interface WalkerSpriteProps {
  /** Declared treadmill speed — sets the stride frequency. */
  speedKmh: number;
  /** Multiple of 32: 32 / 64 / 96. */
  size?: 32 | 64 | 96;
  className?: string;
}

export function WalkerSprite({ speedKmh, size = 64, className }: WalkerSpriteProps) {
  const scale = size / FRAME_PX;
  const duration = stepDurationSec(speedKmh);

  return (
    <div
      className={cn('block shrink-0 overflow-hidden', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={m.walkerSprite.aria}
    >
      <div
        className="pixelated"
        style={{
          width: FRAME_PX,
          height: FRAME_PX,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          backgroundImage: "url('/sprites/walk.svg')",
          backgroundRepeat: 'no-repeat',
          backgroundSize: `${SHEET_PX}px ${FRAME_PX}px`,
          animation: `walk-cycle ${duration}s steps(8) infinite`,
        }}
      />
    </div>
  );
}
