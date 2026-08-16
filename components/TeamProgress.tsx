'use client';

import Link from 'next/link';
import { useId } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/8bit/card';
import { Progress } from '@/components/ui/8bit/progress';
import { Skeleton } from '@/components/ui/8bit/skeleton';
import { useTeamProgress } from '@/lib/client/api';
import { cn } from '@/lib/cn';
import { formatKm } from '@/lib/format';
import { fmt, INTL_LOCALE, m } from '@/lib/i18n';
import type { TeamProgressDto } from '@/lib/types';

interface TeamProgressProps {
  className?: string;
}

/** Distance left to a city — whole km: route distances are approximate. */
function routeKm(km: number): string {
  return Math.round(Math.max(0, km)).toLocaleString(INTL_LOCALE);
}

/** Hard four-way outline — pixel stroke without blur. */
const PERCENT_OUTLINE = {
  textShadow:
    '1px 1px 0 var(--background), -1px -1px 0 var(--background), ' +
    '1px -1px 0 var(--background), -1px 1px 0 var(--background)',
} as const;

function ProgressBar({ ratio, label }: { ratio: number; label: string }) {
  const safeRatio = Math.min(1, Math.max(0, ratio));
  const percent = Math.round(safeRatio * 100);
  return (
    /*
      8bitcn `variant="retro"`: the bar is built from twenty squares, one
      lighting up per ~5% of the route. No animation at all — an instant state change by design. The percentage sits on top of the bar:
      the outlined digit reads on both lime and empty segments.
    */
    <div className="relative">
      <Progress
        value={percent}
        aria-label={`${label} — ${percent}%`}
        variant="retro"
        progressBg="bg-lime"
        font="normal"
        className="h-6"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center retro text-[10px] leading-none text-text-main"
        style={PERCENT_OUTLINE}
      >
        {percent}%
      </span>
    </div>
  );
}

function ProgressBody({ data }: { data: TeamProgressDto }) {
  const { totalKm, passed, next, kmLeft, progressRatio, route } = data;

  // "No route selected" is a normal state of an empty table:
  // team kilometers are still shown; the bar is replaced by an invitation.
  if (!passed || route.length < 2) {
    return (
      <p className="text-sm text-text-dim">
        {fmt(m.teamProgress.noRoutePrefix, { km: formatKm(totalKm) })}
        <Link href="/settings" className="text-citrus underline-offset-4 hover:underline">
          {m.teamProgress.noRouteLink}
        </Link>
        {m.teamProgress.noRouteSuffix}
      </p>
    );
  }

  // Distance covered is not rounded: the team honestly earned every 100 m.
  const caption = next
    ? fmt(m.teamProgress.captionNext, {
        km: formatKm(totalKm),
        city: next.city,
        left: routeKm(kmLeft),
      })
    : fmt(m.teamProgress.captionDone, { km: formatKm(totalKm) });

  return (
    <>
      {/* City names are data — regular sans. */}
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium text-citrus" title={passed.city}>
          {passed.city}
        </span>
        <span className="min-w-0 truncate text-text-dim" title={next?.city ?? m.teamProgress.finishLabel}>
          {next?.city ?? m.teamProgress.finishLabel}
        </span>
      </div>

      <div className="mt-3">
        <ProgressBar ratio={next ? progressRatio : 1} label={caption} />
      </div>

      <p className="mt-3 text-sm text-text-dim">{caption}</p>

      {/* Full route chain: the header shows the current segment's
          ends, this line answers "what's next" — passed cities dimmed, the
          next one highlighted. Names are data, sans. */}
      {route.length >= 2 && (
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-dim">
          {route.map((point, index) => (
            <span key={point.city} className="flex items-center gap-x-1.5">
              {index > 0 && <span aria-hidden>→</span>}
              <span
                title={fmt(m.teamProgress.kmFromStart, { km: point.km })}
                className={cn(
                  point.km <= totalKm && 'opacity-50',
                  next?.city === point.city && 'font-medium text-citrus',
                )}
              >
                {point.city}
              </span>
            </span>
          ))}
        </p>
      )}
    </>
  );
}

/**
 * Team route goal: the one mechanic where a strong walker
 * adds to a weak one instead of taking from them.
 *
 * Panel is an 8bitcn `Card` — same double pixel frame as the hint feed, keeping
 * the home blocks in one rhythm. `font="normal"`: only city names and a caption
 * inside, i.e. the data layer; the title is exempt and set in
 * pixel font, like the start block's.
 */
export function TeamProgress({ className }: TeamProgressProps) {
  const { data, error, isLoading } = useTeamProgress();
  const titleId = useId();

  return (
    // The title is visible, so the section is named by it rather than a
    // separate aria-label: two different names for one block confuse navigation.
    <section aria-labelledby={titleId} className={cn('w-full', className)}>
      <Card font="normal">
        <CardHeader>
          {/* text-sm on mobile: the pixel font is wide and hits the edge of a
              360 px screen at 16px.
              `retro` in the class is mandatory — className in 8bitcn overrides it. */}
          <CardTitle
            id={titleId}
            className="retro text-sm leading-snug break-words sm:text-base"
          >
            {m.teamProgress.title}
          </CardTitle>
        </CardHeader>
        <CardContent font="normal">
          {isLoading && !data ? (
            <div className="space-y-3" aria-hidden="true">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : null}

          {!isLoading && !data ? (
            <p className="text-sm text-text-dim">
              {error ? m.teamProgress.unavailable : m.teamProgress.notStarted}
            </p>
          ) : null}

          {data ? <ProgressBody data={data} /> : null}
        </CardContent>
      </Card>
    </section>
  );
}
