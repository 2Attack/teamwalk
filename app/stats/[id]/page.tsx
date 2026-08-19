'use client';

import Link from 'next/link';
import { use } from 'react';

import { Avatar } from '@/components/Avatar';
import { StatsDailyChart } from '@/components/StatsDailyChart';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/8bit/card';
import { Skeleton } from '@/components/ui/8bit/skeleton';
import { useUserDaily } from '@/lib/client/api';
import { STATS_DAYS } from '@/lib/config';
import { fmt, m } from '@/lib/i18n';

/**
 * Per-participant statistics. One block for now — the daily
 * time/distance chart; the layout is a column so future blocks (records,
 * achievements) can stack below.
 */
export default function StatsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, isLoading } = useUserDaily(id);

  const hasWalks = data?.days.some((d) => d.walksCount > 0) ?? false;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/"
        className="font-pixel flex min-h-11 items-center self-start text-xs text-text-dim transition-colors hover:text-text-main focus-visible:text-text-main"
      >
        {m.settings.backHome}
      </Link>

      {isLoading && !data && !error && (
        <div className="space-y-4" aria-hidden="true">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-72 w-full" />
        </div>
      )}

      {/* Unknown id: the API answers 404 — same treatment as a missing page. */}
      {error && !data && (
        <Card font="normal">
          <CardContent font="normal">
            <p className="text-center text-sm text-text-dim">{m.statsPage.notFound}</p>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <header className="flex items-center gap-3">
            <Avatar avatarId={data.user.avatarId} name={data.user.name} size={48} />
            <div className="min-w-0">
              <h1 className="truncate text-lg" title={data.user.name}>
                {data.user.name}
              </h1>
              <p className="font-pixel text-[10px] text-text-dim">{m.statsPage.title}</p>
            </div>
          </header>

          <Card font="normal">
            <CardHeader font="normal">
              <CardTitle font="retro" className="text-sm">
                {m.statsPage.chartTitle}
              </CardTitle>
              <CardDescription font="normal">
                {fmt(m.statsPage.chartCaption, { days: STATS_DAYS })}
              </CardDescription>
            </CardHeader>
            <CardContent font="normal">
              {hasWalks ? (
                <StatsDailyChart days={data.days} />
              ) : (
                <p className="py-8 text-center text-sm text-text-dim">
                  {fmt(m.statsPage.empty, { days: STATS_DAYS })}
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
