'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { Avatar } from '@/components/Avatar';
import { StreakBadge } from '@/components/StreakBadge';
import { Button } from '@/components/ui/8bit/button';
import { Icon } from '@/components/ui/icon';
import { Card, CardContent } from '@/components/ui/8bit/card';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/8bit/table';
import { Skeleton } from '@/components/ui/8bit/skeleton';
import { useLeaderboard } from '@/lib/client/api';
import { cn } from '@/lib/cn';
import { formatKm } from '@/lib/format';
import { fmt, m } from '@/lib/i18n';
import type { LeaderboardRowDto, Period, PeriodSelection } from '@/lib/types';

interface LeaderboardProps {
  period: PeriodSelection;
  currentUserId?: string | null;
}

const PERIOD_LABEL: Record<Period, string> = {
  week: m.leaderboard.periodWeek,
  month: m.leaderboard.periodMonth,
  all: m.leaderboard.periodAll,
};

/** Period caption for the visually hidden table title. */
function periodLabel(selection: PeriodSelection): string {
  if (selection.period === 'custom') {
    return fmt(m.leaderboard.periodCustom, { from: selection.from, to: selection.to });
  }
  return PERIOD_LABEL[selection.period];
}

/**
 * Mobile layout: `tr` becomes a flex card instead of a horizontally scrolling
 * page ("collapses into cards"). Roles are explicit: changing a
 * table's `display` otherwise breaks its semantics for screen readers.
 *
 * All mobile classes use the `max-sm:` modifier — 8bitcn appends its borders
 * after our className, and without the modifier tailwind-merge would drop ours.
 */
const CARD_ROW =
  'max-sm:mb-2 max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-3 max-sm:gap-y-2 ' +
  'max-sm:border-3 max-sm:border-solid max-sm:bg-bg-panel max-sm:p-3';

/** `tabular-nums` keeps the number column from shifting as digits change. */
const STAT_CELL =
  'px-2 py-2 text-right align-middle tabular-nums ' +
  'max-sm:basis-[calc(50%-0.375rem)] max-sm:px-0 max-sm:py-0 max-sm:text-left';

/**
 * Headers are short but regular sans: pixel font on «ПРОГУЛОК» is 128 px in an
 * 80 px column, and shrinking it to 8 px kills readability.
 */
const HEAD_CELL =
  'h-auto px-2 py-2 text-left text-[10px] leading-tight tracking-wide whitespace-normal ' +
  'uppercase text-text-dim';

/** Column label inside the mobile card; replaced by `thead` on tablet and wider. */
function CellLabel({ children }: { children: string }) {
  return (
    <span aria-hidden="true" className="block text-[10px] leading-tight text-text-dim sm:hidden">
      {children}
    </span>
  );
}

function LeaderboardRow({
  row,
  isCurrent,
  isIdle,
}: {
  row: LeaderboardRowDto;
  isCurrent: boolean;
  isIdle: boolean;
}) {
  return (
    <TableRow
      role="row"
      aria-current={isCurrent ? 'true' : undefined}
      className={cn(
        // Instant state change instead of a color transition.
        'transition-none',
        CARD_ROW,
        isIdle && 'text-text-dim',
        // Highlight own row: citrus fill on wide screens, inset citrus outline
        // on the mobile card. Don't touch the row border: 8bitcn appends its
        // own after ours and would repaint it anyway.
        isCurrent && 'bg-citrus/10 max-sm:shadow-[inset_0_0_0_3px_var(--color-citrus)]',
      )}
    >
      <TableCell
        role="cell"
        className="px-2 py-2 font-pixel text-[16px] max-sm:px-0 max-sm:py-0"
      >
        {isIdle ? '—' : row.rank}
      </TableCell>

      <TableCell
        role="cell"
        className="px-2 py-2 max-sm:min-w-0 max-sm:flex-1 max-sm:px-0 max-sm:py-0"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Avatar avatarId={row.user.avatarId} name={row.user.name} size={32} />
          {/* Name in regular sans; long names truncate with ellipsis. */}
          <span className="min-w-0 truncate" title={row.user.name}>
            {row.user.name}
          </span>
        </div>
      </TableCell>

      <TableCell role="cell" className={cn(STAT_CELL, !isIdle && 'text-lime')}>
        <CellLabel>{m.leaderboard.colDistance}</CellLabel>
        {formatKm(row.totalKm)}
      </TableCell>
      <TableCell role="cell" className={STAT_CELL}>
        <CellLabel>{m.leaderboard.colWalks}</CellLabel>
        {row.walksCount}
      </TableCell>
      <TableCell role="cell" className={STAT_CELL}>
        <CellLabel>{m.leaderboard.colStreak}</CellLabel>
        <StreakBadge days={row.streakDays} />
      </TableCell>
      <TableCell role="cell" className={STAT_CELL}>
        <CellLabel>{m.leaderboard.colAvgSpeed}</CellLabel>
        {row.avgSpeedKmh > 0 ? `${row.avgSpeedKmh.toFixed(1)} ${m.units.kmh}` : '—'}
      </TableCell>

      {/* Stats page link; on mobile it docks to the card's right edge. */}
      <TableCell
        role="cell"
        className="px-1 py-1 text-right align-middle max-sm:ml-auto max-sm:px-0 max-sm:py-0"
      >
        <Button
          asChild
          variant="ghost"
          size="icon"
          font="normal"
          className="min-h-11 min-w-11"
          aria-label={fmt(m.leaderboard.statsAria, { name: row.user.name })}
        >
          <Link href={`/stats/${row.user.id}`}>
            <Icon name="chart" size={16} />
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <Card font="normal">
      <CardContent font="normal">
        <p className="text-center text-sm text-text-dim">{m.leaderboard.empty}</p>
      </CardContent>
    </Card>
  );
}

/**
 * Arcade high-score table on 8bitcn `Table`.
 *
 * `font="normal"` on the whole table: member names must be regular sans
 * («Константин Верещагин» in pixel font blows up the row).
 * Pixel font returns selectively via `font-pixel` — only on the rank,
 * i.e. the identity layer.
 */
export function Leaderboard({ period, currentUserId }: LeaderboardProps) {
  const { data, isLoading } = useLeaderboard(period);

  // Members with zero distance sink to the bottom, grayed out.
  const ordered = useMemo<LeaderboardRowDto[]>(() => {
    const rows = data?.rows ?? [];
    return [...rows.filter((r) => r.totalKm > 0), ...rows.filter((r) => r.totalKm <= 0)];
  }, [data]);

  if (isLoading && !data) return <TableSkeleton />;

  if (ordered.length === 0) return <EmptyState />;

  return (
    // 8bitcn wrapper is `w-fit` — without this the table would shrink to content.
    // Slight breakout past the page column: seven columns plus the pixel
    // stats button need ~24px more than max-w-3xl to fit without a scrollbar.
    <div className="w-full [&>div]:w-full sm:-mx-3 sm:w-[calc(100%+1.5rem)]">
      <Table
        role="table"
        font="normal"
        className={cn(
          'w-full table-fixed max-sm:block',
          // The library paints row dividers in foreground/ring — a solid citrus
          // dash across 100 rows. Muted with an extra-specificity selector,
          // since 8bitcn appends its table className after ours.
          '[&_tr]:border-border-dim dark:[&_tr]:border-border-dim',
        )}
      >
        <TableCaption className="sr-only">
          {fmt(m.leaderboard.caption, { period: periodLabel(period) })}
        </TableCaption>
        <TableHeader className="max-sm:hidden">
          <TableRow role="row" className="transition-none">
            <TableHead scope="col" role="columnheader" className={cn(HEAD_CELL, 'w-12')}>
              #
            </TableHead>
            <TableHead scope="col" role="columnheader" className={HEAD_CELL}>
              {m.leaderboard.colParticipant}
            </TableHead>
            <TableHead scope="col" role="columnheader" className={cn(HEAD_CELL, 'w-24 text-right')}>
              {m.leaderboard.colDistance}
            </TableHead>
            <TableHead scope="col" role="columnheader" className={cn(HEAD_CELL, 'w-20 text-right')}>
              {m.leaderboard.colWalks}
            </TableHead>
            <TableHead scope="col" role="columnheader" className={cn(HEAD_CELL, 'w-24 text-right')}>
              {m.leaderboard.colStreak}
            </TableHead>
            <TableHead scope="col" role="columnheader" className={cn(HEAD_CELL, 'w-24 text-right')}>
              {m.leaderboard.colAvgSpeedShort}
            </TableHead>
            {/* Stats-link column: the icon is self-explanatory, header stays empty. */}
            <TableHead scope="col" role="columnheader" className={cn(HEAD_CELL, 'w-14')}>
              <span className="sr-only">{m.statsPage.title}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="max-sm:block">
          {ordered.map((row) => (
            <LeaderboardRow
              key={row.user.id}
              row={row}
              isCurrent={Boolean(currentUserId && row.user.id === currentUserId)}
              isIdle={row.totalKm <= 0}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
