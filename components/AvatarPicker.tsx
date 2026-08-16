'use client';

/**
 * Character picker: 6×4 grid of 24 presets.
 *
 * Taken presets are dimmed and labeled but still selectable — a hard block
 * would dead-end once there are more than 24 members.
 * Keyboard follows the radiogroup pattern: Tab enters the grid once, arrows
 * move the selection, Home/End jump to the edges.
 */
import * as React from 'react';

import { AVATARS, avatarLabel } from '@/lib/avatars';
import { cn } from '@/lib/cn';
import { fmt, m } from '@/lib/i18n';

import { Avatar } from './Avatar';

/** 6×4 grid per spec; at 360px a cell shrinks to ~48px and stays a valid touch target. */
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
  /** Presets taken by other members. */
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
   * Focus follows selection: otherwise arrow keys stop working after the first
   * step, and Safari doesn't focus buttons on click. No scroll jump — focus
   * always lands on the cell just clicked or arrowed to, which is visible.
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

  // Tab entry point: the selected item, or the first one if value is unknown.
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
              {/* `!` is required: Avatar sets its size via inline style, but the cell tracks the grid. */}
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
                // Caption is the data layer — regular sans.
                <span className="absolute inset-x-0 bottom-0 bg-bg-deep/85 text-center text-[10px] leading-tight text-text-dim">
                  {m.avatarPicker.takenBadge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected preset caption. No "random" button: a random free avatar is
          already pre-filled when the add-user dialog opens (see AddUserDialog). */}
      <p className="truncate text-sm text-text-dim">{avatarLabel(value)}</p>
    </div>
  );
}
