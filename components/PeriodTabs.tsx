'use client';

import { useState } from 'react';
import { enUS, es, ru } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';

import { Button } from '@/components/ui/8bit/button';
import { Calendar } from '@/components/ui/8bit/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/8bit/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/8bit/tabs';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { INTL_LOCALE, LOCALE, m } from '@/lib/i18n';
import { addOfficeDays, toOfficeDay } from '@/lib/time';
import type { Period, PeriodSelection } from '@/lib/types';

interface PeriodTabsProps {
  value: PeriodSelection;
  onChange: (s: PeriodSelection) => void;
  className?: string;
}

interface DayRange {
  from: string;
  to: string;
}

const TABS: ReadonlyArray<{ value: Period | 'custom'; label: string; short: string }> = [
  { value: 'week', label: m.periodTabs.week, short: m.periodTabs.weekShort },
  { value: 'month', label: m.periodTabs.month, short: m.periodTabs.monthShort },
  // On 360 px the full "all time" label does not fit in the pixel font.
  { value: 'all', label: m.periodTabs.all, short: m.periodTabs.allShort },
  { value: 'custom', label: m.periodTabs.custom, short: m.periodTabs.customShort },
];

/** date-fns locale for the range calendar, matched to the app locale. */
const DATE_FNS_LOCALE = { ru, en: enUS, es }[LOCALE];

/** Initial custom range: the last 7 office days including today. */
function defaultRange(): DayRange {
  const today = toOfficeDay();
  return { from: addOfficeDays(today, -6), to: today };
}

/**
 * Office day → `Date` for the calendar: local midnight of the same calendar
 * day. `officeDayStart` won't do — the calendar lives in the device timezone,
 * and Moscow midnight west of Moscow would render as the previous day.
 */
function dayToDate(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Calendar-selected day → `YYYY-MM-DD` from local fields, no timezone shift. */
function dateToDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const dayLabelFmt = new Intl.DateTimeFormat(INTL_LOCALE, { day: 'numeric', month: 'short' });
const dayLabelWithYearFmt = new Intl.DateTimeFormat(INTL_LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** Button label like «5 авг. — 13 авг.»; the year is appended only when not current. */
function formatRangeLabel(range: DayRange): string {
  const currentYear = String(new Date().getFullYear());
  const fmt = (day: string) =>
    (day.startsWith(currentYear) ? dayLabelFmt : dayLabelWithYearFmt).format(dayToDate(day));
  return range.from === range.to ? fmt(range.from) : `${fmt(range.from)} — ${fmt(range.to)}`;
}

/**
 * Leaderboard period switcher (spec § 6.2, 6.8.2) on 8bitcn `Tabs`.
 * The tablist pattern is fully delegated to Base UI (`role="tablist"`, roving
 * tabindex, arrow/Home/End navigation) — no custom handlers.
 *
 * The fourth tab is a custom date range: a button with the current bounds
 * appears below the tabs and opens a range calendar in a popover. Every
 * calendar click goes straight to `onChange` — the leaderboard behind the
 * popover updates live, there is no "Apply" button.
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

  const handleSelect = (selected: DateRange | undefined) => {
    // A click that clears the selection doesn't change the range: no empty periods.
    if (!selected?.from) return;
    const from = dateToDay(selected.from);
    const to = dateToDay(selected.to ?? selected.from);
    // The library orders bounds itself, but the API contract is `from <= to`.
    applyRange(from <= to ? { from, to } : { from: to, to: from });
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
              // min-h-11: touch target at least 44 px (spec § 6.7.7).
              'min-h-11 px-3 text-[16px] leading-none',
              // Active tab: citrus fill. Selector must be data-active — base
              // Tabs is built on Base UI, not Radix's data-[state=active].
              // The `dark:` pair is mandatory: the base defines the active
              // state in a `dark:` variant too, which in our always-dark theme
              // would override a lone selector.
              'data-active:bg-primary data-active:text-primary-foreground',
              'dark:data-active:bg-primary dark:data-active:text-primary-foreground',
              // Instant state change instead of a color transition (spec § 6.7.6).
              'transition-none',
            )}
          >
            <span className="sm:hidden">{tab.short}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      {value.period === 'custom' && (
        <Popover>
          {/*
            Base UI (`base-nova` style in components.json) injects its element
            via `render`, not Radix's `asChild`.
          */}
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                // Dates are digits and month abbreviations: sans, because
                // Cyrillic like «авг.» falls apart in the pixel font, which
                // has no Cyrillic glyphs (spec § 6.7.1).
                font="normal"
                aria-label={m.periodTabs.changeDatesAria}
                className="mt-3 min-h-11 gap-2 px-3 text-sm tabular-nums"
              />
            }
          >
            <Icon name="calendar" size={16} />
            {formatRangeLabel(value)}
          </PopoverTrigger>

          <PopoverContent font="normal" className="w-auto p-0" aria-label={m.periodTabs.popoverAria}>
            <Calendar
              mode="range"
              locale={DATE_FNS_LOCALE}
              font="normal"
              numberOfMonths={1}
              defaultMonth={dayToDate(value.to)}
              selected={{ from: dayToDate(value.from), to: dayToDate(value.to) }}
              onSelect={handleSelect}
              // No future walks — days after today are disabled.
              disabled={{ after: new Date() }}
              // The popover draws the frame: the calendar's own "ears" inside
              // the panel would double the frame (same trick as Command).
              className="border-y-0 [&>div.absolute]:hidden"
            />
          </PopoverContent>
        </Popover>
      )}
    </Tabs>
  );
}
