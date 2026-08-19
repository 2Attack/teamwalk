'use client';

import { enUS, es, ru } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';

import { Button } from '@/components/ui/8bit/button';
import { Calendar } from '@/components/ui/8bit/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/8bit/popover';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { INTL_LOCALE, LOCALE, m } from '@/lib/i18n';

/** Inclusive office-day range, `YYYY-MM-DD` both ends, `from <= to`. */
export interface DayRange {
  from: string;
  to: string;
}

interface DateRangePickerProps {
  value: DayRange;
  onChange: (range: DayRange) => void;
  className?: string;
}

/** date-fns locale for the range calendar, matched to the app locale. */
const DATE_FNS_LOCALE = { ru, en: enUS, es }[LOCALE];

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
export function formatRangeLabel(range: DayRange): string {
  const currentYear = String(new Date().getFullYear());
  const fmt = (day: string) =>
    (day.startsWith(currentYear) ? dayLabelFmt : dayLabelWithYearFmt).format(dayToDate(day));
  return range.from === range.to ? fmt(range.from) : `${fmt(range.from)} — ${fmt(range.to)}`;
}

/**
 * Office-day range picker: a button with the current bounds opening a range
 * calendar in a popover. Every calendar click goes straight to `onChange` —
 * the view behind the popover updates live, there is no "Apply" button.
 * Used by the leaderboard period tabs and the per-user stats page.
 */
export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const handleSelect = (selected: DateRange | undefined) => {
    // A click that clears the selection doesn't change the range: no empty periods.
    if (!selected?.from) return;
    const from = dateToDay(selected.from);
    const to = dateToDay(selected.to ?? selected.from);
    // The library orders bounds itself, but the API contract is `from <= to`.
    onChange(from <= to ? { from, to } : { from: to, to: from });
  };

  return (
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
            // has no Cyrillic glyphs.
            font="normal"
            aria-label={m.periodTabs.changeDatesAria}
            className={cn('min-h-11 gap-2 px-3 text-sm tabular-nums', className)}
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
  );
}
