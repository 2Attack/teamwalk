'use client';

import { useId } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/8bit/card';
import { Progress } from '@/components/ui/8bit/progress';
import { Skeleton } from '@/components/ui/8bit/skeleton';
import { useTeamProgress } from '@/lib/client/api';
import { cn } from '@/lib/cn';
import { formatKm } from '@/lib/format';
import type { TeamProgressDto } from '@/lib/types';

interface TeamProgressProps {
  className?: string;
}

/** Остаток до города — целыми: расстояния маршрута ориентировочные (п. 6.6.8). */
function routeKm(km: number): string {
  return Math.round(Math.max(0, km)).toLocaleString('ru-RU');
}

/** Жёсткий контур в четыре стороны — пиксельная обводка без blur (п. 6.7.6). */
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
      `variant="retro"` из 8bitcn: полоса набирается двадцатью квадратами, свой
      слой насечек поверх заливки больше не нужен. Шаг маршрута — 1/20, то есть
      квадрат зажигается примерно каждые 5 % пути; полоса и раньше двигалась
      редко (только на финише прогулки), так что ступенька заметнее плавности.
      Анимации нет вовсе — п. 6.7.6 требует именно мгновенной смены состояния.
      Пиксельная рамка полосы — из самой библиотеки. Проценты — поверх полосы:
      цифра со «своим» контуром читается и на лаймовых, и на пустых сегментах.
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

  // Пройденное — без округления: команда честно заработала каждую сотку.
  const caption = next
    ? `${formatKm(totalKm)} км пройдено, до ${next.city} ${routeKm(kmLeft)} км`
    : `${formatKm(totalKm)} км пройдено — маршрут пройден целиком. Выберите следующий в настройках`;

  return (
    <>
      {/* Названия городов — данные, значит обычный sans (п. 6.7.1). */}
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium text-citrus" title={passed.city}>
          {passed.city}
        </span>
        <span className="min-w-0 truncate text-text-dim" title={next?.city ?? 'Финиш'}>
          {next?.city ?? 'Финиш'}
        </span>
      </div>

      <div className="mt-3">
        <ProgressBar ratio={next ? progressRatio : 1} label={caption} />
      </div>

      <p className="mt-3 text-sm text-text-dim">{caption}</p>

      {/* Полная цепочка маршрута (п. 6.12): шапка показывает края текущего
          отрезка, а эта строка отвечает на «а что дальше?» — пройденные города
          приглушены, следующий подсвечен. Названия — данные, sans (п. 6.7.1). */}
      {route.length >= 2 && (
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-dim">
          {route.map((point, index) => (
            <span key={point.city} className="flex items-center gap-x-1.5">
              {index > 0 && <span aria-hidden>→</span>}
              <span
                title={`${point.km} км от старта`}
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
 * Командная цель на маршруте (п. 6.6.8, 6.8.2): единственная механика, где сильный
 * ходок складывается со слабым, а не отнимает у него.
 *
 * Панель — `Card` из 8bitcn: та же двойная пиксельная рамка, что и у ленты хинтов,
 * поэтому блоки главной держат общий ритм. `font="normal"` — внутри только
 * названия городов и подпись, то есть слой данных (п. 6.7.1); заголовок из этого
 * правила выведен и набран пиксельным, как у блока старта.
 */
export function TeamProgress({ className }: TeamProgressProps) {
  const { data, error, isLoading } = useTeamProgress();
  const titleId = useId();

  return (
    // Заголовок виден на экране, поэтому имя секции берётся из него, а не из
    // отдельного aria-label: два разных названия одного блока сбивают навигацию.
    <section aria-labelledby={titleId} className={cn('w-full', className)}>
      <Card font="normal">
        <CardHeader>
          {/* text-sm на мобильном: пиксельный шрифт широкий и 16-м кеглем
              упирается в край экрана 360 px (п. 6.7.2).
              `retro` в классе обязателен — className в 8bitcn перекрывает его. */}
          <CardTitle
            id={titleId}
            className="retro text-sm leading-snug break-words sm:text-base"
          >
            Маршрут команды
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
              {error ? 'Прогресс команды пока недоступен' : 'Команда ещё не вышла в путь'}
            </p>
          ) : null}

          {data ? <ProgressBody data={data} /> : null}
        </CardContent>
      </Card>
    </section>
  );
}
