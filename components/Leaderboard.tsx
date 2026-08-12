'use client';

import { useMemo } from 'react';

import { Avatar } from '@/components/Avatar';
import { StreakBadge } from '@/components/StreakBadge';
import { Card, CardContent } from '@/components/ui/8bit/card';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/8bit/table';
import { Skeleton } from '@/components/ui/8bit/skeleton';
import { useLeaderboard } from '@/lib/client/api';
import { cn } from '@/lib/cn';
import { formatKm } from '@/lib/format';
import type { LeaderboardRowDto, Period } from '@/lib/types';

interface LeaderboardProps {
  period: Period;
  currentUserId?: string | null;
}

const PERIOD_LABEL: Record<Period, string> = {
  week: 'неделю',
  month: 'месяц',
  all: 'всё время',
};

/**
 * Мобильная раскладка: `tr` становится flex-карточкой, а не страницей с горизонтальным
 * скроллом (п. 6.2 — «схлопывается в карточки»). Роли проставлены явно: смена `display`
 * у таблицы иначе ломает её семантику для скринридеров.
 *
 * Все мобильные классы идут с модификатором `max-sm:` — 8bitcn дописывает свои
 * рамки после нашего className, и без модификатора tailwind-merge выбросил бы наши.
 */
const CARD_ROW =
  'max-sm:mb-2 max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-3 max-sm:gap-y-2 ' +
  'max-sm:border-3 max-sm:border-solid max-sm:bg-bg-panel max-sm:p-3';

/** `tabular-nums` — чтобы колонка чисел не «плясала» при смене разрядов (п. 6.7.2). */
const STAT_CELL =
  'px-2 py-2 text-right align-middle tabular-nums ' +
  'max-sm:basis-[calc(50%-0.375rem)] max-sm:px-0 max-sm:py-0 max-sm:text-left';

/**
 * Заголовки короткие, но обычным sans: пиксельный шрифт на «ПРОГУЛОК» — это 128 px
 * при колонке в 80 px, а уменьшать его до 8 px нельзя по читаемости (п. 6.7.1).
 */
const HEAD_CELL =
  'h-auto px-2 py-2 text-left text-[10px] leading-tight tracking-wide whitespace-normal ' +
  'uppercase text-text-dim';

/** Подпись колонки внутри мобильной карточки: на планшете и шире её заменяет `thead`. */
function CellLabel({ children }: { children: string }) {
  return (
    <span aria-hidden="true" className="block text-[10px] leading-tight text-text-dim sm:hidden">
      {children}
    </span>
  );
}

function LeaderboardRow({
  row,
  isCurrent,
  isIdle,
}: {
  row: LeaderboardRowDto;
  isCurrent: boolean;
  isIdle: boolean;
}) {
  return (
    <TableRow
      role="row"
      aria-current={isCurrent ? 'true' : undefined}
      className={cn(
        // Мгновенная смена состояний вместо цветового перехода (п. 6.7.6).
        'transition-none',
        CARD_ROW,
        isIdle && 'text-text-dim',
        // Подсветка своей строки: на широком экране цитрусовая заливка, в мобильной
        // карточке — цитрусовая обводка внутрь. Рамку строки трогать нельзя:
        // 8bitcn дописывает свою после нашей и всё равно перекрасит.
        isCurrent && 'bg-citrus/10 max-sm:shadow-[inset_0_0_0_3px_var(--color-citrus)]',
      )}
    >
      <TableCell
        role="cell"
        className="px-2 py-2 font-pixel text-[16px] max-sm:px-0 max-sm:py-0"
      >
        {isIdle ? '—' : row.rank}
      </TableCell>

      <TableCell
        role="cell"
        className="px-2 py-2 max-sm:min-w-0 max-sm:flex-1 max-sm:px-0 max-sm:py-0"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Avatar avatarId={row.user.avatarId} name={row.user.name} size={32} />
          {/* Имя — обычным sans (п. 6.7.1), длинное режется многоточием. */}
          <span className="min-w-0 truncate" title={row.user.name}>
            {row.user.name}
          </span>
        </div>
      </TableCell>

      <TableCell role="cell" className={cn(STAT_CELL, !isIdle && 'text-lime')}>
        <CellLabel>Дистанция, км</CellLabel>
        {formatKm(row.totalKm)}
      </TableCell>
      <TableCell role="cell" className={STAT_CELL}>
        <CellLabel>Прогулок</CellLabel>
        {row.walksCount}
      </TableCell>
      <TableCell role="cell" className={STAT_CELL}>
        <CellLabel>Серия</CellLabel>
        <StreakBadge days={row.streakDays} />
      </TableCell>
      <TableCell role="cell" className={STAT_CELL}>
        <CellLabel>Средняя скорость</CellLabel>
        {row.avgSpeedKmh > 0 ? `${row.avgSpeedKmh.toFixed(1)} км/ч` : '—'}
      </TableCell>
    </TableRow>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <Card font="normal">
      <CardContent font="normal">
        <p className="text-center text-sm text-text-dim">Ещё никто не ходил — будьте первым</p>
      </CardContent>
    </Card>
  );
}

/**
 * Таблица рекордов аркадного автомата (п. 6.2, 6.7.5) на `Table` из 8bitcn:
 * двойная пиксельная рамка и жирная линия под шапкой — из библиотеки.
 *
 * `font="normal"` на всей таблице: имена участников обязаны быть обычным sans
 * («Константин Верещагин» пиксельным разносит строку, п. 6.7.1). Пиксельный шрифт
 * возвращается точечно классом `font-pixel` — только на ранге, то есть на слое
 * идентичности.
 */
export function Leaderboard({ period, currentUserId }: LeaderboardProps) {
  const { data, isLoading } = useLeaderboard(period);

  // Участники с нулевой дистанцией уходят в конец списка серым (п. 6.2).
  const ordered = useMemo<LeaderboardRowDto[]>(() => {
    const rows = data?.rows ?? [];
    return [...rows.filter((r) => r.totalKm > 0), ...rows.filter((r) => r.totalKm <= 0)];
  }, [data]);

  if (isLoading && !data) return <TableSkeleton />;

  if (ordered.length === 0) return <EmptyState />;

  return (
    // Обёртка 8bitcn объявлена `w-fit` — таблица без этого сжалась бы по контенту.
    <div className="w-full [&>div]:w-full">
      <Table
        role="table"
        font="normal"
        className={cn(
          'w-full table-fixed max-sm:block',
          // Разделители строк библиотека красит в foreground/ring: на 100 строк
          // это сплошной цитрусовый пунктир. Приглушаем селектором с запасом
          // специфичности — className таблицы 8bitcn дописывает после нашего.
          '[&_tr]:border-border-dim dark:[&_tr]:border-border-dim',
        )}
      >
        <TableCaption className="sr-only">
          {`Таблица лидеров за ${PERIOD_LABEL[period]}: место, участник, дистанция в километрах, число прогулок, серия и средняя скорость`}
        </TableCaption>
        <TableHeader className="max-sm:hidden">
          <TableRow role="row" className="transition-none">
            <TableHead scope="col" role="columnheader" className={cn(HEAD_CELL, 'w-12')}>
              #
            </TableHead>
            <TableHead scope="col" role="columnheader" className={HEAD_CELL}>
              Участник
            </TableHead>
            <TableHead scope="col" role="columnheader" className={cn(HEAD_CELL, 'w-24 text-right')}>
              Дистанция, км
            </TableHead>
            <TableHead scope="col" role="columnheader" className={cn(HEAD_CELL, 'w-20 text-right')}>
              Прогулок
            </TableHead>
            <TableHead scope="col" role="columnheader" className={cn(HEAD_CELL, 'w-24 text-right')}>
              Серия
            </TableHead>
            <TableHead scope="col" role="columnheader" className={cn(HEAD_CELL, 'w-24 text-right')}>
              Ср. скорость
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="max-sm:block">
          {ordered.map((row) => (
            <LeaderboardRow
              key={row.user.id}
              row={row}
              isCurrent={Boolean(currentUserId && row.user.id === currentUserId)}
              isIdle={row.totalKm <= 0}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
