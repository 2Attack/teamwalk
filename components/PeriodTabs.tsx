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

/** Стартовый произвольный период — последние 7 офисных дней включая сегодня. */
function defaultRange(): DayRange {
  const today = toOfficeDay();
  return { from: addOfficeDays(today, -6), to: today };
}

/**
 * Офисная дата → `Date` для календаря: локальная полночь того же календарного
 * дня. Через `officeDayStart` нельзя — календарь живёт в зоне устройства, и
 * московская полночь западнее Москвы отобразилась бы предыдущим днём.
 */
function dayToDate(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Выбранный в календаре день → `YYYY-MM-DD` из локальных полей, без сдвига зоны. */
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

/** Метка кнопки: «5 авг. — 13 авг.»; год дописывается, только если он не текущий. */
function formatRangeLabel(range: DayRange): string {
  const currentYear = String(new Date().getFullYear());
  const fmt = (day: string) =>
    (day.startsWith(currentYear) ? dayLabelFmt : dayLabelWithYearFmt).format(dayToDate(day));
  return range.from === range.to ? fmt(range.from) : `${fmt(range.from)} — ${fmt(range.to)}`;
}

/**
 * Переключатель периода рейтинга (п. 6.2, 6.8.2) на `Tabs` из 8bitcn.
 * Паттерн tablist целиком отдан библиотеке: `role="tablist"`, roving tabindex и
 * ходьба стрелками/Home/End приходят из Base UI, поэтому своих обработчиков нет.
 *
 * Четвёртая вкладка «Период» — произвольный диапазон дат: под вкладками
 * появляется кнопка с текущими границами, по ней — range-календарь в поповере.
 * Каждый клик по календарю сразу уходит в `onChange`: рейтинг за спиной
 * поповера обновляется живьём, отдельной кнопки «Применить» нет.
 *
 * Панелей (`TabsContent`) нет намеренно: содержимое вкладки — пьедестал и таблица,
 * которые лежат в разметке страницы рядом и следуют одному периоду. Состояние
 * держит родитель — иначе на экране висели бы два противоречащих топ-3.
 * «Неделя» — вкладка по умолчанию, но дефолт задаёт родитель, а не этот компонент.
 */
export function PeriodTabs({ value, onChange, className }: PeriodTabsProps) {
  // Последний выбранный диапазон переживает уход на другие вкладки:
  // вернувшись на «Период», участник видит свои даты, а не сброс к дефолту.
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
    // Клик, снявший выделение, диапазон не меняет: пустого периода не бывает.
    if (!selected?.from) return;
    const from = dateToDay(selected.from);
    const to = dateToDay(selected.to ?? selected.from);
    // Библиотека упорядочивает границы сама, но контракт API — `from <= to`.
    applyRange(from <= to ? { from, to } : { from: to, to: from });
  };

  return (
    <Tabs
      value={value.period}
      onValueChange={handleTabChange}
      /*
        Пиксельные «уши» рамки 8bitcn вылезают на 6 px за габарит списка со всех
        сторон (inset-0 с -m-1.5), поэтому вокруг оставлен ровно такой отступ.
      */
      // `items-center` — вкладки по центру под пьедесталом; корень Tabs в
      // горизонтальной ориентации это flex-колонка, поэтому центрирует список.
      className={cn('items-center p-1.5', className)}
    >
      <TabsList
        aria-label={m.periodTabs.listAria}
        className={cn(
          'gap-1 p-0',
          // h-8 из базы приходит с вариантом (специфичность 0,2,0), поэтому
          // перебить её можно только тем же вариантом — иначе тач-таргет 32 px.
          'group-data-horizontal/tabs:h-auto',
        )}
      >
        {TABS.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            aria-label={tab.label}
            className={cn(
              // min-h-11: тач-таргет не меньше 44 px (п. 6.7.7).
              'min-h-11 px-3 text-[16px] leading-none',
              // Активная вкладка — цитрусовая заливка, как раньше у кнопки `default`.
              // Селектор именно data-active: базовый Tabs собран на Base UI,
              // где нет radix-овского data-[state=active] из класса библиотеки.
              // Пара с `dark:` обязательна: в базе активное состояние задано и в
              // `dark:`-варианте, а он в нашей всегда тёмной теме перебил бы одиночный.
              'data-active:bg-primary data-active:text-primary-foreground',
              'dark:data-active:bg-primary dark:data-active:text-primary-foreground',
              // Мгновенная смена состояния вместо цветового перехода (п. 6.7.6).
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
            Base UI (стиль `base-nova` в components.json) подставляет свой
            элемент через `render`, а не через `asChild` как Radix.
          */}
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                // Даты — цифры и сокращения месяцев: sans, иначе кириллица
                // «авг.» пиксельным шрифтом без кириллицы рассыпается (п. 6.7.1).
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
              // Будущих прогулок не бывает — дни после сегодняшнего закрыты.
              disabled={{ after: new Date() }}
              // Рамку рисует поповер: собственные «уши» календаря внутри панели
              // дали бы вторую рамку в рамке (тот же приём, что у Command).
              className="border-y-0 [&>div.absolute]:hidden"
            />
          </PopoverContent>
        </Popover>
      )}
    </Tabs>
  );
}
