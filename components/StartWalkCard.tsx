'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { SpeedPicker } from '@/components/SpeedPicker';
import { TreadmillPicker, busyLabel, elapsedSec, useNowTick } from '@/components/TreadmillPicker';
import { UserSelect } from '@/components/UserSelect';
import { Button } from '@/components/ui/8bit/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/8bit/card';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/8bit/skeleton';
import { ApiError, apiGet, apiSend, useTreadmills, useUserStats } from '@/lib/client/api';
import { DEFAULT_SPEED_KMH, MAX_SPEED_KMH_ABS } from '@/lib/config';
import { formatDuration } from '@/lib/format';
import type { ActiveWalkDto, TreadmillBusyDto, TreadmillDto, UserDto } from '@/lib/types';

interface StartWalkCardProps {
  users: UserDto[];
  userId: string | null;
  onSelectUser: (userId: string) => void;
}

/** Блок старта прогулки: участник → дорожка → скорость → «Start walk» (п. 6.1). */
export function StartWalkCard({ users, userId, onSelectUser }: StartWalkCardProps) {
  const router = useRouter();
  const { data: treadmills, isLoading, mutate: reloadTreadmills } = useTreadmills();
  const { data: userStats } = useUserStats(userId);

  const [treadmillId, setTreadmillId] = useState<string | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = treadmills ?? [];
  const free = list.filter((t) => t.busy === null);
  // Значение выводим, а не только храним в стейте: в первом кадре после загрузки
  // дорожек эффект предвыбора ещё не отработал, и кнопка мигнула бы «выберите дорожку».
  const activeTreadmillId = treadmillId ?? pickTreadmill(list, null, userStats?.lastTreadmillId);
  const selectedTreadmill = list.find((t) => t.id === activeTreadmillId) ?? null;
  // Пока дорожка не выбрана (например, все заняты) — потолок первой по списку,
  // чтобы ряд скоростей не разрастался до абсолютного санити-предела.
  const maxSpeed = selectedTreadmill?.maxSpeedKmh ?? list[0]?.maxSpeedKmh ?? MAX_SPEED_KMH_ABS;
  const now = useNowTick(list.some((t) => t.busy !== null));

  // Предвыбор дорожки: последняя дорожка участника, если свободна,
  // иначе первая свободная по sortOrder (п. 6.9.3).
  const pickedFor = useRef<string | null>(null);
  useEffect(() => {
    if (treadmills === undefined) return;
    const sameUser = pickedFor.current === userId;
    pickedFor.current = userId;
    setTreadmillId((prev) => pickTreadmill(treadmills, sameUser ? prev : null, userStats?.lastTreadmillId));
  }, [treadmills, userId, userStats?.lastTreadmillId]);

  // Предвыбор скорости: скорость прошлой прогулки, для нового участника — дефолт (п. 6.2).
  useEffect(() => {
    setSpeed(userId === null ? null : (userStats?.lastSpeedKmh ?? DEFAULT_SPEED_KMH));
  }, [userId, userStats?.lastSpeedKmh]);

  // Переключили дорожку с меньшим потолком — поджимаем выбранное значение (п. 6.9.3).
  useEffect(() => {
    setSpeed((prev) => (prev !== null && prev > maxSpeed ? maxSpeed : prev));
  }, [maxSpeed]);

  async function handleStart() {
    if (!userId || speed === null || starting) return; // защита от двойного нажатия
    setStarting(true);
    setError(null);
    try {
      const walk = await apiSend<ActiveWalkDto>('POST', '/api/walks/start', {
        userId,
        speedKmh: speed,
        // Дорожку не передаём, если её нет: при единственной активной сервер
        // подставит её сам (п. 6.9.2).
        ...(activeTreadmillId ? { treadmillId: activeTreadmillId } : {}),
      });
      router.push(`/walk/${walk.id}`);
    } catch (err) {
      await handleStartError(err);
    } finally {
      setStarting(false);
    }
  }

  /** Обе «конфликтные» 409-ошибки имеют осмысленный исход, а не текст ошибки. */
  async function handleStartError(err: unknown) {
    if (err instanceof ApiError && err.code === 'WALK_ALREADY_ACTIVE' && userId) {
      const active = await apiGet<ActiveWalkDto | null>(`/api/walks/active?userId=${userId}`);
      if (active) {
        router.replace(`/walk/${active.id}`);
        return;
      }
    }
    if (err instanceof ApiError && err.code === 'TREADMILL_BUSY') {
      await reloadTreadmills();
      setError('Эту дорожку только что заняли. Выберите свободную.');
      return;
    }
    setError(
      err instanceof ApiError
        ? err.message
        : 'Не удалось начать прогулку. Проверьте сеть и повторите.',
    );
  }

  if (isLoading) {
    return <StartWalkCardSkeleton />;
  }

  // Единственный сценарий, в котором стартовать нельзя вовсе (п. 6.9.6).
  if (list.length === 0) {
    return (
      <StartCard title="Дорожек сейчас нет">
        <div className="flex items-start gap-3">
          <Icon name="pin" size={16} className="mt-0.5" />
          <p className="text-sm text-text-dim">
            Все дорожки выведены из строя. Когда дорожку вернут, блок старта появится сам —
            обновлять страницу не нужно.
          </p>
        </div>
      </StartCard>
    );
  }

  const blocker = startBlocker(list, free, selectedTreadmill, now);
  const canStart = userId !== null && speed !== null && blocker === null;

  return (
    <StartCard title="Старт прогулки">
      <UserSelect users={users} value={userId} onChange={onSelectUser} />

      {users.length === 0 && (
        <p className="text-sm text-text-dim">
          В команде пока никого. Нажмите «Добавить» и заведите первого участника.
        </p>
      )}

      <TreadmillPicker treadmills={list} value={activeTreadmillId} onChange={setTreadmillId} />

      <SpeedPicker value={speed} max={maxSpeed} onChange={setSpeed} />

      {error && (
        <p
          role="alert"
          className="border-l-[3px] border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <div className="space-y-2 pt-1">
        <Button
          type="button"
          size="lg"
          className="min-h-14 w-full gap-2 text-sm"
          disabled={!canStart || starting}
          onClick={handleStart}
        >
          {starting ? (
            'Стартуем…'
          ) : (
            <>
              <Icon name="play" size={16} />
              Start walk
            </>
          )}
        </Button>
        {blocker && (
          <p
            aria-live="polite"
            className="flex items-start gap-2 text-sm text-text-dim"
          >
            <Icon name="clock" size={16} className="mt-0.5" />
            <span>{blocker}</span>
          </p>
        )}
      </div>
    </StartCard>
  );
}

/**
 * Общая рамка блока старта: заголовок пиксельный, содержимое — обычным sans,
 * иначе имена и подписи внутри карточки станут нечитаемыми (п. 6.7.1).
 */
function StartCard({ title, children }: { title: string; children: React.ReactNode }) {
  // overflow-visible: базовая карточка shadcn режет содержимое по своей рамке,
  // и выпадающий список участников обрезался бы по нижнему краю карточки.
  return (
    <Card font="normal" className="overflow-visible">
      <CardHeader>
        {/* text-sm на мобильном: пиксельный шрифт широкий, «Старт прогулки»
            16-м кеглем упирается в край экрана 360 px (п. 6.7.2).
            `retro` в классе обязателен — className в 8bitcn перекрывает его. */}
        <CardTitle className="retro text-sm leading-snug break-words sm:text-base">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent font="normal" className="space-y-5">
        {children}
      </CardContent>
    </Card>
  );
}

/** Плейсхолдер блока старта: та же рамка, чтобы экран не «прыгал» после загрузки. */
export function StartWalkCardSkeleton() {
  return (
    <StartCard title="Старт прогулки">
      <div className="space-y-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-11 w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-3 w-40" />
        <div className="grid grid-cols-5 gap-3 sm:grid-cols-10">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      </div>
      <Skeleton className="h-14 w-full" />
    </StartCard>
  );
}

/** Почему нельзя стартовать; `null` — можно. Занятость видна до нажатия (п. 6.9.2). */
function startBlocker(
  list: TreadmillDto[],
  free: TreadmillDto[],
  selected: TreadmillDto | null,
  now: number,
): string | null {
  if (list.length === 1) {
    const busy = list[0].busy;
    if (busy) {
      return `сейчас на дорожке ${busy.user.name}, идёт ${formatDuration(elapsedSec(busy.startedAt, now))}`;
    }
  }
  if (free.length === 0) {
    // Ближайшее освобождение неизвестно, поэтому показываем того, кто идёт дольше всех.
    const busyList = list
      .map((t) => t.busy)
      .filter((b): b is TreadmillBusyDto => b !== null)
      .sort((a, b) => elapsedSec(b.startedAt, now) - elapsedSec(a.startedAt, now));
    const tail = busyList[0] ? ` Дольше всех — ${busyLabel(busyList[0], now)}.` : '';
    return `все дорожки заняты, подождите.${tail}`;
  }
  if (selected === null) return 'выберите свободную дорожку';
  if (selected.busy) return busyLabel(selected.busy, now);
  return null;
}

/** Последняя дорожка участника, если свободна; иначе первая свободная по sortOrder. */
function pickTreadmill(
  list: TreadmillDto[],
  current: string | null,
  lastTreadmillId: string | null | undefined,
): string | null {
  const free = list.filter((t) => t.busy === null);
  if (current && free.some((t) => t.id === current)) return current;
  if (lastTreadmillId && free.some((t) => t.id === lastTreadmillId)) return lastTreadmillId;
  return [...free].sort((a, b) => a.sortOrder - b.sortOrder)[0]?.id ?? null;
}
