'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/8bit/tabs';
import { cn } from '@/lib/cn';
import type { Period } from '@/lib/types';

interface PeriodTabsProps {
  value: Period;
  onChange: (p: Period) => void;
  className?: string;
}

const TABS: ReadonlyArray<{ value: Period; label: string; short: string }> = [
  { value: 'week', label: 'Неделя', short: 'Нед.' },
  { value: 'month', label: 'Месяц', short: 'Мес.' },
  // На 360 px «Всё время» пиксельным шрифтом (16 px = 16 px на символ) не влезает.
  { value: 'all', label: 'Всё время', short: 'Всё' },
];

/**
 * Переключатель периода рейтинга (п. 6.2, 6.8.2) на `Tabs` из 8bitcn.
 * Паттерн tablist целиком отдан библиотеке: `role="tablist"`, roving tabindex и
 * ходьба стрелками/Home/End приходят из Base UI, поэтому своих обработчиков нет.
 *
 * Панелей (`TabsContent`) нет намеренно: содержимое вкладки — пьедестал и таблица,
 * которые лежат в разметке страницы рядом и следуют одному периоду. Состояние
 * держит родитель — иначе на экране висели бы два противоречащих топ-3.
 * «Неделя» — вкладка по умолчанию, но дефолт задаёт родитель, а не этот компонент.
 */
export function PeriodTabs({ value, onChange, className }: PeriodTabsProps) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onChange(next as Period)}
      /*
        Пиксельные «уши» рамки 8bitcn вылезают на 6 px за габарит списка со всех
        сторон (inset-0 с -m-1.5), поэтому вокруг оставлен ровно такой отступ.
      */
      // `items-center` — вкладки по центру под пьедесталом; корень Tabs в
      // горизонтальной ориентации это flex-колонка, поэтому центрирует список.
      className={cn('items-center p-1.5', className)}
    >
      <TabsList
        aria-label="Период рейтинга"
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
    </Tabs>
  );
}
