'use client';

import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';

import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/8bit/chart';
import { formatDurationHuman, formatKm } from '@/lib/format';
import { m } from '@/lib/i18n';
import type { DailyStatDto } from '@/lib/types';

/**
 * Daily time/distance areas. Minutes and km live on different scales, so each
 * series is drawn normalized to its own maximum (0–100) — neither metric can
 * crush the other; exact values come from the tooltip, not the curve height.
 */

const chartConfig = {
  time: { label: m.statsPage.legendTime, color: 'var(--color-citrus)' },
  dist: { label: m.statsPage.legendKm, color: 'var(--color-lime)' },
} satisfies ChartConfig;

/** `2026-08-18` → `18.08` — locale-neutral numeric tick. */
function dayTick(day: string): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}`;
}

export function StatsDailyChart({ days }: { days: DailyStatDto[] }) {
  const maxSec = Math.max(1, ...days.map((d) => d.durationSec));
  const maxKm = Math.max(1, ...days.map((d) => d.km));

  const data = days.map((d) => ({
    day: d.day,
    time: (d.durationSec / maxSec) * 100,
    dist: (d.km / maxKm) * 100,
    durationSec: d.durationSec,
    km: d.km,
  }));

  return (
    <ChartContainer config={chartConfig} className="h-56 w-full sm:h-64">
      <AreaChart data={data} margin={{ top: 10, left: 4, right: 4 }}>
        <defs>
          <linearGradient id="fillTime" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-time)" stopOpacity={0.8} />
            <stop offset="95%" stopColor="var(--color-time)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="fillDist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-dist)" stopOpacity={0.8} />
            <stop offset="95%" stopColor="var(--color-dist)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-dim)" />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={28}
          tickFormatter={dayTick}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(value) => dayTick(String(value))}
              formatter={(_value, name, item) => (
                <>
                  <div
                    className="h-2.5 w-2.5 shrink-0"
                    style={{ background: `var(--color-${String(name)})` }}
                  />
                  <span className="text-muted-foreground">
                    {chartConfig[name as keyof typeof chartConfig].label}
                  </span>
                  <span className="ml-auto font-medium tabular-nums">
                    {name === 'dist'
                      ? `${formatKm(Number(item?.payload?.km ?? 0))} ${m.units.km}`
                      : formatDurationHuman(Number(item?.payload?.durationSec ?? 0))}
                  </span>
                </>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Area
          type="monotone"
          dataKey="time"
          stroke="var(--color-time)"
          strokeWidth={2}
          activeDot={{ stroke: 'var(--color-time)' }}
          fillOpacity={1}
          fill="url(#fillTime)"
        />
        <Area
          type="monotone"
          dataKey="dist"
          stroke="var(--color-dist)"
          strokeWidth={2}
          activeDot={{ stroke: 'var(--color-dist)' }}
          fillOpacity={1}
          fill="url(#fillDist)"
        />
      </AreaChart>
    </ChartContainer>
  );
}
