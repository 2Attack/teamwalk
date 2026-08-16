'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { Avatar } from '@/components/Avatar';
import { useNowTick } from '@/components/TreadmillPicker';
import { Button } from '@/components/ui/8bit/button';
import { Card, CardContent } from '@/components/ui/8bit/card';
import { Icon } from '@/components/ui/icon';
import { elapsedSec, formatDuration } from '@/lib/format';
import { fmt, m } from '@/lib/i18n';

export interface WalkInProgressCardProps {
  walkId: string;
  user: { name: string; avatarId: string };
  /** ISO; the live duration is derived from it every second. */
  startedAt: string;
  speedKmh: number;
  treadmillName?: string;
  /**
   * `resume` — the selected participant's own walk, with a primary action
   * button; `busy` — someone else's walk, the whole card is the tap target.
   */
  variant: 'resume' | 'busy';
}

/**
 * In-progress walk card (spec 002): who walks, where, for how long — with a
 * tap-through to the walk screen. Replaces the plain-text busy blockers.
 * Built on the 8bitcn `Card`; compact `--card-spacing` because it always
 * renders inside the start card's frame.
 */
export function WalkInProgressCard({
  walkId,
  user,
  startedAt,
  speedKmh,
  treadmillName,
  variant,
}: WalkInProgressCardProps): React.JSX.Element {
  const router = useRouter();
  const now = useNowTick(true);
  const href = `/walk/${walkId}`;

  // Same warm-up as the start flow: the tap should land without a loading flash.
  useEffect(() => {
    router.prefetch(href);
  }, [router, href]);

  const duration = formatDuration(elapsedSec(startedAt, now));

  const row = (
    <div className="flex w-full items-center gap-3">
      <Avatar avatarId={user.avatarId} size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-tight font-medium text-text-main">{user.name}</p>
        <p className="text-xs leading-snug text-text-dim">
          {treadmillName !== undefined && <>{treadmillName} · </>}
          {/* tabular-nums: the ticking duration must not make the line jitter. */}
          <span className="tabular-nums">{fmt(m.walkCard.elapsed, { duration })}</span>
          {' · '}
          {fmt(m.walkCard.speed, { speed: speedKmh })}
        </p>
      </div>
      {variant === 'busy' && <Icon name="arrowRight" size={16} className="text-text-dim" />}
    </div>
  );

  if (variant === 'busy') {
    return (
      <Card
        font="normal"
        role="button"
        tabIndex={0}
        aria-label={fmt(m.walkCard.openWalkAria, { name: user.name })}
        onClick={() => router.push(href)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            router.push(href);
          }
        }}
        className="cursor-pointer transition-transform [--card-spacing:0.75rem] select-none active:translate-y-0.5"
      >
        <CardContent font="normal" className="min-h-11">
          {row}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card font="normal" className="[--card-spacing:0.75rem]">
      <CardContent font="normal" className="space-y-3">
        {row}
        <Button
          type="button"
          size="lg"
          className="min-h-12 w-full gap-2 text-xs"
          onClick={() => router.push(href)}
        >
          <Icon name="walk" size={16} />
          {m.walkCard.openWalk}
        </Button>
      </CardContent>
    </Card>
  );
}
