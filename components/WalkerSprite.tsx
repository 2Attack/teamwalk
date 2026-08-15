'use client';

/**
 * Шагающий персонаж — лицо экрана прогулки (п. 6.7.6).
 *
 * Спрайт-лист: 8 кадров по 32×32 → 256×32. Кейфреймы `walk-cycle` в globals.css
 * сдвигают фон ровно на 256px за цикл, поэтому анимируемый слой всегда 1×,
 * а увеличение делается `transform: scale()` на обёртке — масштабирование
 * через background-size сбило бы шаг кейфрейма.
 *
 * `prefers-reduced-motion` глушится глобальным CSS: отдельной проверки здесь нет,
 * чтобы не расходиться с ним в поведении.
 */

import { cn } from '@/lib/cn';
import { m } from '@/lib/i18n';

const FRAME_PX = 32;
const SHEET_PX = 256;

/** Ступенчатая привязка темпа шага к скорости: без плавной интерполяции (п. 6.7.6). */
function stepDurationSec(speedKmh: number): number {
  // Скорость приходит с сервера: NaN сломал бы CSS-анимацию целиком.
  if (!Number.isFinite(speedKmh) || speedKmh <= 2) return 1.2;
  if (speedKmh <= 3) return 1;
  if (speedKmh <= 4) return 0.8;
  if (speedKmh <= 5) return 0.65;
  if (speedKmh <= 7) return 0.5;
  return 0.4;
}

interface WalkerSpriteProps {
  /** Заявленная скорость дорожки — задаёт частоту шагов. */
  speedKmh: number;
  /** Кратно 32: 32 / 64 / 96. */
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
