'use client';

/**
 * Аватар участника (п. 6.5) — `Avatar` из 8bitcn в варианте `pixel`:
 * круглая пиксельная рамка-«лесенка» рисуется самой библиотекой, поэтому своей
 * цитрусовой обводки здесь больше нет.
 *
 * Портрет — статика из `/public/avatars/{id}.svg`, сгенерированная DiceBear
 * (`npm run gen:assets`). Fallback обязателен в двух случаях: пресет удалили из
 * каталога после релиза (`isAvatarId` → false) и файл не отдался. Битая картинка
 * в строке рейтинга выглядит как поломка приложения, поэтому рисуется силуэт.
 */
import * as React from 'react';

import { Avatar as BitAvatar, AvatarFallback, AvatarImage } from '@/components/ui/8bit/avatar';
import { avatarSrc, isAvatarId } from '@/lib/avatars';
import { cn } from '@/lib/cn';

export interface AvatarProps {
  avatarId: string;
  /** Имя участника. Задаёт `alt`; без него аватар декоративен. */
  name?: string;
  size?: number;
  className?: string;
}

/**
 * Обод 8bitcn скрыт.
 *
 * Рамку библиотека рисует плашками внутри первого дочернего div обёртки, и
 * отключить её пропом нельзя: `pixel` даёт круглую «лесенку», `default` и `retro` —
 * четыре планки по краям. Поэтому контейнер рамки просто прячется. Селектор
 * попадает и на Root, но там среди детей нет ни одного div (картинка и fallback),
 * так что задеть ему нечего.
 */
const NO_FRAME = '[&>div:first-child]:hidden';

/**
 * Квадратная маска вместо круглой.
 *
 * `variant="pixel"` жёстко ставит `rounded-full` и на самом аватаре, и на
 * fallback-силуэте, а нулевое скругление — общее правило проекта (`--radius: 0`,
 * п. 6.7.1). Классы идут после библиотечных, поэтому tailwind-merge оставляет наши.
 */
const SQUARE = 'rounded-none';

/** Нейтральный силуэт: голова и плечи по пиксельной сетке 16×16, без внешних файлов. */
function FallbackSilhouette(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" className="h-full w-full" aria-hidden focusable="false">
      <rect width="16" height="16" fill="var(--color-bg-panel)" />
      <rect x="5" y="3" width="6" height="6" fill="var(--color-text-dim)" />
      <rect x="3" y="10" width="10" height="6" fill="var(--color-text-dim)" />
    </svg>
  );
}

export function Avatar({ avatarId, name, size = 40, className }: AvatarProps): React.JSX.Element {
  const known = isAvatarId(avatarId);

  return (
    /*
      Размер держит эта обёртка, а не сам компонент: `AvatarPicker` растягивает
      аватар по ячейке сетки классами `h-full!`/`w-full!`, и они должны попадать
      на тот же элемент, что и числовой размер. Внутренний `h-full w-full`
      уводит портрет 8bitcn под этот бокс.
    */
    <span className={cn('inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      <BitAvatar variant="pixel" font="normal" className={cn('h-full w-full', NO_FRAME, SQUARE)}>
        {known ? (
          <AvatarImage
            src={avatarSrc(avatarId)}
            alt={name ?? ''}
            aria-hidden={name ? undefined : true}
            draggable={false}
            className="pixelated select-none"
          />
        ) : null}
        {/*
          Radix показывает fallback, пока картинка не загрузилась и если она упала.
          `delayMs` не ставим: на локальной статике мигание не успевает случиться,
          а без fallback пустой круг читался бы как сломанный аватар.
        */}
        <AvatarFallback className={cn('bg-bg-panel', SQUARE)}>
          <FallbackSilhouette />
        </AvatarFallback>
      </BitAvatar>
    </span>
  );
}
