'use client';

import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/8bit/skeleton';
import { useStats } from '@/lib/client/api';
import { APP_NAME, IS_VERCEL_PREVIEW } from '@/lib/config';
import { formatKm } from '@/lib/format';

/**
 * Шапка главной: логотип пиксельным шрифтом + суммарные километры команды (п. 6.1).
 * Логотип и число — «идентичность», поэтому пиксельные; подпись — sans (п. 6.7.1).
 *
 * Число и подпись стоят одной строкой: в две строки правый блок перевешивал
 * логотип по высоте и тянул на себя всю шапку.
 */
export function AppHeader() {
  const { data, error, isLoading } = useStats();

  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b-[3px] border-border-dim pb-4">
      <h1 className="font-pixel text-base leading-none sm:text-2xl">
        <span className="text-citrus">Team</span>
        <span className="text-text-main">Walk</span>
        {/* Метка тестового окружения — чтобы шапку превью не спутать с продом. */}
        {IS_VERCEL_PREVIEW && <span className="text-text-dim"> — PREVIEW</span>}
        <span className="sr-only"> — {APP_NAME}</span>
      </h1>

      <div className="text-right">
        {isLoading ? (
          <Skeleton className="ml-auto h-6 w-40" />
        ) : (
          <p className="font-pixel flex items-center justify-end gap-2 text-base leading-none text-lime sm:text-2xl">
            <Icon name="walk" size={16} />
            {/* При недоступной статистике показываем 0.00, а не «сломанный» блок. */}
            {formatKm(error ? 0 : data?.teamTotalKm)}
            {/* Подпись не масштабируется вместе с числом: набранная пиксельным
                кеглем 24 px, она заняла бы полшапки. */}
            <span className="font-ui text-xs font-normal text-text-dim">km/team</span>
          </p>
        )}
      </div>
    </header>
  );
}
