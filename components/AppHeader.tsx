'use client';

import Link from 'next/link';

import { Skeleton } from '@/components/ui/8bit/skeleton';
import { Icon } from '@/components/ui/icon';
import { useStats } from '@/lib/client/api';
import { APP_NAME, IS_VERCEL_PREVIEW } from '@/lib/config';
import { formatKm } from '@/lib/format';
import { m } from '@/lib/i18n';

/**
 * Home header: pixel-font logo + team total kilometers (spec § 6.1) + the gear
 * link to the settings screen (spec § 6.11.1). Logo and the number are
 * "identity", hence pixel; the caption is sans (spec § 6.7.1).
 *
 * Number and caption sit on one line: stacked in two lines the right block
 * outweighed the logo in height and pulled the whole header along.
 */
export function AppHeader() {
  const { data, error, isLoading } = useStats();

  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b-[3px] border-border-dim pb-4">
      <h1 className="font-pixel text-base leading-none sm:text-2xl">
        <span className="text-citrus">Team</span>
        <span className="text-text-main">Walk</span>
        {/* Test-environment mark so a preview header is not mistaken for prod. */}
        {IS_VERCEL_PREVIEW && <span className="text-text-dim"> — PREVIEW</span>}
        <span className="sr-only"> — {APP_NAME}</span>
      </h1>

      <div className="flex items-center gap-1">
        <div className="text-right">
          {isLoading ? (
            <Skeleton className="ml-auto h-6 w-40" />
          ) : (
            <p className="font-pixel flex items-center justify-end gap-2 text-base leading-none text-lime sm:text-2xl">
              <Icon name="walk" size={16} />
              {/* When stats are unavailable show 0.00 instead of a "broken" block. */}
              {formatKm(error ? 0 : data?.teamTotalKm)}
              {/* The caption does not scale with the number: set in 24 px pixel
                  type it would take half the header. */}
              <span className="font-ui text-xs font-normal text-text-dim">{m.units.kmTeam}</span>
            </p>
          )}
        </div>

        {/* Settings entry (spec § 6.11.1): 44 px touch target, icon-only with an
            aria-label — the gear is a universally readable symbol here.
            Negative vertical margins cancel the target's extra height so the
            icon centers on the km line instead of stretching the header. */}
        <Link
          href="/settings"
          aria-label={m.home.settingsAria}
          className="-my-3 flex min-h-11 min-w-11 items-center justify-center text-text-dim transition-colors hover:text-text-main focus-visible:text-text-main"
        >
          <Icon name="gear" size={16} />
        </Link>
      </div>
    </header>
  );
}
