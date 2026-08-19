'use client';

import { useState } from 'react';

import { DateRangePicker, type DayRange } from '@/components/DateRangePicker';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/8bit/tabs';
import { cn } from '@/lib/cn';
import { m } from '@/lib/i18n';
import { addOfficeDays, toOfficeDay } from '@/lib/time';
import type { Period, PeriodSelection } from '@/lib/types';

interface PeriodTabsProps {
  value: PeriodSelection;
  onChange: (s: PeriodSelection) => void;
  className?: string;
}

const TABS: ReadonlyArray<{ value: Period | 'custom'; label: string; short: string }> = [
  { value: 'week', label: m.periodTabs.week, short: m.periodTabs.weekShort },
  { value: 'month', label: m.periodTabs.month, short: m.periodTabs.monthShort },
  // On 360 px the full "all time" label does not fit in the pixel font.
  { value: 'all', label: m.periodTabs.all, short: m.periodTabs.allShort },
  { value: 'custom', label: m.periodTabs.custom, short: m.periodTabs.customShort },
];

/** Initial custom range: the last 7 office days including today. */
function defaultRange(): DayRange {
  const today = toOfficeDay();
  return { from: addOfficeDays(today, -6), to: today };
}

/**
 * Leaderboard period switcher on 8bitcn `Tabs`.
 * The tablist pattern is fully delegated to Base UI (`role="tablist"`, roving
 * tabindex, arrow/Home/End navigation) — no custom handlers.
 *
 * The fourth tab is a custom date range served by the shared
 * `DateRangePicker` below the tabs.
 *
 * No `TabsContent` panels on purpose: tab content is the podium and table that
 * sit next to each other in the page and follow one period. The parent owns
 * the state — otherwise two contradicting top-3s could be on screen. The
 * parent also sets the default tab.
 */
export function PeriodTabs({ value, onChange, className }: PeriodTabsProps) {
  // The last chosen range survives switching to other tabs: returning to
  // "custom" shows the user's dates, not a reset to the default.
  const [lastRange, setLastRange] = useState<DayRange>(defaultRange);

  const applyRange = (range: DayRange) => {
    setLastRange(range);
    onChange({ period: 'custom', ...range });
  };

  const handleTabChange = (next: string) => {
    if (next === 'custom') applyRange(lastRange);
    else onChange({ period: next as Period });
  };

  return (
    <Tabs
      value={value.period}
      onValueChange={handleTabChange}
      /*
        The 8bitcn pixel frame "ears" overflow the list by 6 px on all sides
        (inset-0 with -m-1.5), hence exactly that much padding around.
      */
      // `items-center` centers the tabs under the podium; the Tabs root in
      // horizontal orientation is a flex column, so it centers the list.
      className={cn('items-center p-1.5', className)}
    >
      <TabsList
        aria-label={m.periodTabs.listAria}
        className={cn(
          'gap-1 p-0',
          // Base h-8 comes with a variant (specificity 0,2,0), so it can only
          // be overridden with the same variant — otherwise a 32 px touch target.
          'group-data-horizontal/tabs:h-auto',
        )}
      >
        {TABS.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            aria-label={tab.label}
            className={cn(
              // min-h-11: touch target at least 44 px.
              'min-h-11 px-3 text-[16px] leading-none',
              // Active tab: citrus fill. Selector must be data-active — base
              // Tabs is built on Base UI, not Radix's data-[state=active].
              // The `dark:` pair is mandatory: the base defines the active
              // state in a `dark:` variant too, which in our always-dark theme
              // would override a lone selector.
              'data-active:bg-primary data-active:text-primary-foreground',
              'dark:data-active:bg-primary dark:data-active:text-primary-foreground',
              // Instant state change instead of a color transition.
              'transition-none',
            )}
          >
            <span className="sm:hidden">{tab.short}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      {value.period === 'custom' && (
        <DateRangePicker
          value={{ from: value.from, to: value.to }}
          onChange={applyRange}
          className="mt-3"
        />
      )}
    </Tabs>
  );
}
