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
import { m } from '@/lib/i18n';
import type { LeaderboardRowDto, PeriodSelection } from '@/lib/types';

interface PodiumProps {
  period: PeriodSelection;
  currentUserId?: string | null;
}

interface PlaceConfig {
  place: 1 | 2 | 3;
  avatarSize: number;
  /** Pedestal height — 1st place is always taller (spec § 6.2). */
  block: string;
  /** Multiple of 8 — otherwise the icon's pixel grid drifts off whole pixels. */
  iconSize: number;
  accent: string;
  border: string;
}

/** Display order: 2nd left, 1st center and taller, 3rd right. */
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

/** Leader change animates as a reorder, not a jump (spec § 6.7.6). */
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
      // Key is the member id: on leader change Motion FLIPs to the new position.
      layout
      transition={SPRING}
      // basis-0 + flex-1: three equal-width columns on any screen from 360 px.
      className="flex min-w-0 max-w-40 flex-1 basis-0 flex-col items-center"
    >
      {row ? (
        <>
          <Avatar avatarId={row.user.avatarId} name={row.user.name} size={config.avatarSize} />
          {/* min-w-0 on the parent + w-full here: long names truncate with ellipsis. */}
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
            <span className="ml-1 text-[10px] text-text-dim">{m.units.km}</span>
          </p>
        </>
      ) : (
        <>
          {/* Empty id — Avatar draws the neutral silhouette itself, no image request. */}
          <Avatar
            avatarId=""
            size={config.avatarSize}
            className="border-[3px] border-dashed border-border-dim opacity-70"
          />
          <p className="mt-2 w-full truncate px-1 text-center text-xs leading-tight text-text-dim sm:text-sm">
            {m.podium.emptyPlace}
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
          Trophy only on occupied places: an empty pedestal must promise nothing.
          Same shape for all three, color tells the place (gold/silver/bronze) —
          three different shapes would read as three different awards.
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
 * Top-3 podium styled as a match results screen (spec § 6.2, 6.7.5).
 * Follows the selected period together with the table — two contradicting
 * top-3s on screen are unacceptable. Only members with finished walks count.
 *
 * Custom markup rather than an 8bitcn component: the library has no podium
 * (docs/8BITCN.md), and `.pixel-panel` gives the same geometry — zero radius,
 * 3 px border, blur-less shadow — while allowing gold/silver/bronze pedestal
 * borders, which the 8bitcn Card frame cannot do.
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
        aria-label={m.podium.aria}
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
