'use client';

/**
 * Экран выбора персонажа (п. 6.5): сетка 6×4 из 24 пресетов.
 *
 * Занятые пресеты приглушены и подписаны, но остаются выбираемыми — жёсткий запрет
 * создал бы тупик, как только участников станет больше 24.
 * Клавиатура работает по паттерну radiogroup: Tab входит в сетку один раз,
 * стрелки двигают выбор, Home/End — к краям.
 */
import * as React from 'react';

import { AVATARS, avatarLabel } from '@/lib/avatars';
import { cn } from '@/lib/cn';
import { fmt, m } from '@/lib/i18n';

import { Avatar } from './Avatar';

/** Сетка 6×4 по ТЗ; на 360px ячейка ужимается примерно до 48px и остаётся тач-таргетом. */
const COLUMNS = 6;

const STEP: Record<string, number> = {
  ArrowRight: 1,
  ArrowLeft: -1,
  ArrowDown: COLUMNS,
  ArrowUp: -COLUMNS,
};

export interface AvatarPickerProps {
  value: string;
  onChange: (id: string) => void;
  /** Пресеты, занятые другими участниками. */
  taken?: string[];
}

export function AvatarPicker({
  value,
  onChange,
  taken = [],
}: AvatarPickerProps): React.JSX.Element {
  const refs = React.useRef(new Map<string, HTMLButtonElement>());
  const takenSet = React.useMemo(() => new Set(taken), [taken]);

  /**
   * Фокус едет за выбором: иначе стрелки после первого шага перестают работать,
   * а Safari вдобавок не отдаёт кнопке фокус по клику. Подскроливания это больше
   * не вызывает — фокус всегда уходит на ячейку, по которой только что кликнули
   * или до которой дошли стрелками, то есть заведомо видимую. Рывок был у кнопки
   * «Случайный», которая кидала выбор в произвольную ячейку сетки; кнопки нет.
   */
  const select = React.useCallback(
    (id: string) => {
      onChange(id);
      refs.current.get(id)?.focus();
    },
    [onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (e.key in STEP) next = index + STEP[e.key];
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = AVATARS.length - 1;
    else return;

    e.preventDefault();
    const clamped = Math.min(Math.max(next, 0), AVATARS.length - 1);
    select(AVATARS[clamped].id);
  };

  // Активная точка входа с Tab: выбранный элемент, а при неизвестном value — первый.
  const focusIndex = Math.max(
    AVATARS.findIndex((a) => a.id === value),
    0,
  );

  return (
    <div className="flex flex-col gap-3">
      <div
        role="radiogroup"
        aria-label={m.avatarPicker.gridAria}
        className="grid grid-cols-6 gap-1.5 sm:gap-2"
      >
        {AVATARS.map((preset, index) => {
          const selected = preset.id === value;
          const isTaken = takenSet.has(preset.id);

          return (
            <button
              key={preset.id}
              ref={(el) => {
                if (el) refs.current.set(preset.id, el);
                else refs.current.delete(preset.id);
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={isTaken ? fmt(m.avatarPicker.takenAria, { label: preset.label }) : preset.label}
              tabIndex={index === focusIndex ? 0 : -1}
              onClick={() => select(preset.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={cn(
                'relative flex aspect-square min-h-11 w-full items-center justify-center',
                'rounded-none border-[3px] bg-bg-panel p-1 touch-manipulation',
                selected
                  ? 'border-citrus shadow-[4px_4px_0_0_#000]'
                  : 'border-border-dim hover:border-text-dim',
                isTaken && !selected && 'opacity-50',
              )}
            >
              {/* `!` обязателен: Avatar задаёт размер инлайн-стилем, а ячейка тянется по сетке. */}
              <Avatar
                avatarId={preset.id}
                size={40}
                className="pointer-events-none h-full! w-full!"
              />

              {selected && (
                <span
                  aria-hidden
                  className="absolute -right-[3px] -top-[3px] flex h-4 w-4 items-center justify-center bg-citrus text-[10px] leading-none text-bg-deep"
                >
                  ✓
                </span>
              )}

              {isTaken && (
                // Подпись — слой «данные», поэтому обычный sans (п. 6.7.1).
                <span className="absolute inset-x-0 bottom-0 bg-bg-deep/85 text-center text-[10px] leading-tight text-text-dim">
                  {m.avatarPicker.takenBadge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Подпись выбранного пресета. Кнопки «Случайный» здесь больше нет:
          случайный свободный аватар и так подставляется при открытии
          «Нового участника» (см. AddUserDialog), а выбрать другой можно прямо
          в сетке. */}
      <p className="truncate text-sm text-text-dim">{avatarLabel(value)}</p>
    </div>
  );
}
