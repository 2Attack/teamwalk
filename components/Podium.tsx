'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { Avatar } from '@/components/Avatar';
import { FireworksOverlay } from '@/components/FireworksOverlay';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/8bit/skeleton';
import { leaderboardKey, useLeaderboard } from '@/lib/client/api';
import { observe, type LeaderWatchState } from '@/lib/client/leader-transition';
import { cn } from '@/lib/cn';
import { formatKm } from '@/lib/format';
import type { LeaderboardRowDto, PeriodSelection } from '@/lib/types';

interface PodiumProps {
  period: PeriodSelection;
  currentUserId?: string | null;
}

interface PlaceConfig {
  place: 1 | 2 | 3;
  avatarSize: number;
  /** Высота тумбы — 1-е место всегда выше остальных (п. 6.2). */
  block: string;
  /** Кратно 8 — иначе пиксельная сетка иконки уезжает с целых пикселей. */
  iconSize: number;
  accent: string;
  border: string;
}

/** Порядок вывода: 2 — слева, 1 — по центру и выше, 3 — справа. */
const PLACES: readonly PlaceConfig[] = [
  {
    place: 2,
    avatarSize: 48,
    block: 'h-20 sm:h-28',
    iconSize: 24,
    accent: 'text-silver',
    border: 'border-silver',
  },
  {
    place: 1,
    avatarSize: 64,
    block: 'h-28 sm:h-36',
    iconSize: 32,
    accent: 'text-citrus',
    border: 'border-citrus',
  },
  {
    place: 3,
    avatarSize: 48,
    block: 'h-16 sm:h-24',
    iconSize: 24,
    accent: 'text-bronze',
    border: 'border-bronze',
  },
];

/** Смена лидера — перестроение, а не скачок (п. 6.7.6). */
const SPRING = { type: 'spring', stiffness: 500, damping: 30 } as const;

function PodiumSlot({
  config,
  row,
  isCurrent,
}: {
  config: PlaceConfig;
  row: LeaderboardRowDto | undefined;
  isCurrent: boolean;
}) {
  return (
    <motion.li
      // Ключ — id участника: при смене лидера Motion делает FLIP по новой позиции.
      layout
      transition={SPRING}
      // basis-0 + flex-1: три колонки одинаковой ширины на любом экране от 360 px.
      className="flex min-w-0 max-w-40 flex-1 basis-0 flex-col items-center"
    >
      {row ? (
        <>
          <Avatar avatarId={row.user.avatarId} name={row.user.name} size={config.avatarSize} />
          {/* min-w-0 у родителя + w-full здесь: длинное имя режется многоточием. */}
          <p
            title={row.user.name}
            className={cn(
              'mt-2 w-full truncate px-1 text-center text-xs leading-tight sm:text-sm',
              isCurrent ? 'text-citrus' : 'text-text-main',
            )}
          >
            {row.user.name}
          </p>
          <p className="mt-1 w-full truncate text-center">
            <span className={cn('font-pixel text-[16px]', config.accent)}>
              {formatKm(row.totalKm)}
            </span>
            <span className="ml-1 text-[10px] text-text-dim">км</span>
          </p>
        </>
      ) : (
        <>
          {/* Пустой id — Avatar сам рисует нейтральный силуэт, без запроса за картинкой. */}
          <Avatar
            avatarId=""
            size={config.avatarSize}
            className="border-[3px] border-dashed border-border-dim opacity-70"
          />
          <p className="mt-2 w-full truncate px-1 text-center text-xs leading-tight text-text-dim sm:text-sm">
            Место свободно
          </p>
          <p className="mt-1 text-[10px] leading-none text-text-dim">—</p>
        </>
      )}

      <div
        className={cn(
          'pixel-panel mt-2 flex w-full flex-col items-center justify-start gap-1 pt-1.5',
          config.block,
          row ? config.border : 'border-border-dim',
        )}
      >
        <span
          className={cn('font-pixel text-[24px] leading-none', row ? config.accent : 'text-border-dim')}
        >
          {config.place}
        </span>
        {/*
          Кубок — только у занятого места: пустая тумба не должна ничего обещать.
          Форма у всех трёх одна, место различает цвет (золото/серебро/бронза):
          три разные фигуры читались бы как три разные награды.
        */}
        {row ? <Icon name="trophy" size={config.iconSize} className={config.accent} /> : null}
      </div>
    </motion.li>
  );
}

function PodiumSkeleton() {
  return (
    <div className="flex items-end justify-center gap-2 sm:gap-4" aria-hidden="true">
      {PLACES.map((config) => (
        <div
          key={config.place}
          className="flex w-full max-w-40 flex-1 basis-0 flex-col items-center gap-2"
        >
          <Skeleton className="h-12 w-12 sm:h-16 sm:w-16" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className={cn('w-full', config.block)} />
        </div>
      ))}
    </div>
  );
}

/**
 * Пьедестал топ-3 как экран результатов матча (п. 6.2, 6.7.5).
 * Следует выбранному периоду вместе с таблицей: два противоречащих топ-3 на экране
 * недопустимы. В зачёт идут только участники с завершёнными прогулками.
 *
 * Своя вёрстка, а не компонент 8bitcn: готового аналога подиума в библиотеке нет
 * (docs/8BITCN.md), а `.pixel-panel` даёт ровно ту же геометрию — нулевое
 * скругление, рамка 3 px, тень без blur — и позволяет красить рамку тумбы
 * в золото/серебро/бронзу, чего рамка Card из 8bitcn не умеет.
 */
export function Podium({ period, currentUserId }: PodiumProps) {
  const { data, isLoading } = useLeaderboard(period);
  const reduced = useReducedMotion();
  /** Last displayed first place (specs/001): survives re-renders, never stored. */
  const watchRef = useRef<LeaderWatchState | null>(null);
  const [burstId, setBurstId] = useState(0);

  const periodKey = leaderboardKey(period);
  const top = (data?.rows ?? []).filter((row) => row.totalKm > 0).slice(0, 3);
  const leaderId = top[0]?.user.id ?? null;
  const hasData = Boolean(data);

  // Fireworks on an observed leader change (specs/001-first-place-fireworks).
  // The pure detector decides; reduced motion and a hidden tab only mute the
  // fire signal — the baseline still advances (research D4/D5).
  useEffect(() => {
    if (!hasData) return;
    const { fire, next } = observe(watchRef.current, periodKey, leaderId);
    watchRef.current = next;
    if (!fire || reduced || document.visibilityState === 'hidden') return;
    setBurstId((id) => id + 1);
  }, [hasData, periodKey, leaderId, reduced]);

  if (isLoading && !data) return <PodiumSkeleton />;

  return (
    <>
      <ul
        aria-label="Пьедестал: топ-3 участников"
        className="flex list-none items-end justify-center gap-2 sm:gap-4"
      >
        {PLACES.map((config) => {
          const row = top[config.place - 1];
          return (
            <PodiumSlot
              key={row ? row.user.id : `empty-${config.place}`}
              config={config}
              row={row}
              isCurrent={Boolean(row && currentUserId && row.user.id === currentUserId)}
            />
          );
        })}
      </ul>
      {/* Remount by key on a new fire: restart, never queue (FR-003). */}
      {burstId > 0 ? (
        <FireworksOverlay key={burstId} burstId={burstId} onDone={() => setBurstId(0)} />
      ) : null}
    </>
  );
}
