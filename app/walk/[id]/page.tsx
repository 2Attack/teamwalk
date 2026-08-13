'use client';

import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import useSWR from 'swr';

import { AchievementIcons } from '@/components/AchievementIcons';
import { DialogShell } from '@/components/DialogShell';
import { FinishWalkDialog } from '@/components/FinishWalkDialog';
import { HintTicker } from '@/components/HintTicker';
import { SpeedControl } from '@/components/SpeedControl';
import { TelegramNudge } from '@/components/TelegramNudge';
import { WalkSuccess } from '@/components/WalkSuccess';
import { WalkTimer } from '@/components/WalkTimer';
import { WalkerSprite } from '@/components/WalkerSprite';
import { Button } from '@/components/ui/8bit/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/8bit/dialog';
import { Icon } from '@/components/ui/icon';
import LoadingScreenBlock from '@/components/ui/8bit/blocks/loading-screen';
import PlayerProfileCard from '@/components/ui/8bit/blocks/player-profile-card';
import { avatarSrc } from '@/lib/avatars';
import { STATIC_HINTS } from '@/lib/hints/registry';
import {
  apiGet,
  apiSend,
  revalidateAfterWalk,
  useActiveWalk,
  useUserStats,
} from '@/lib/client/api';
import { LAST_USER_STORAGE_KEY, SHORT_WALK_CANCEL_SEC } from '@/lib/config';
import { calcSegmentedDistanceKm, formatTimeOfDay } from '@/lib/format';
import type { ActiveWalkDto, FinishWalkResultDto, StatsDto, WalkDto } from '@/lib/types';

/**
 * Экран активной прогулки (п. 6.3) — HUD: аватар и имя, крупный таймер,
 * набегающая дистанция, рекорд дня, ходок, лента хинтов и кнопки внизу,
 * в зоне большого пальца (п. 6.7.5).
 */

type DialogMode = 'none' | 'finish' | 'accidental' | 'cancel';

/**
 * Wake Lock: планшет стоит у дорожки, гаснущий экран прячет таймер.
 * API есть не везде и отзывается при уходе вкладки в фон — оба случая штатные.
 */
function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    interface SentinelLike {
      released: boolean;
      release: () => Promise<void>;
    }
    const api = (navigator as unknown as {
      wakeLock?: { request: (type: 'screen') => Promise<SentinelLike> };
    }).wakeLock;
    if (!api) return;

    let sentinel: SentinelLike | null = null;
    let disposed = false;

    const acquire = async () => {
      if (disposed || (sentinel !== null && !sentinel.released)) return;
      try {
        const next = await api.request('screen');
        if (disposed) {
          void next.release().catch(() => undefined);
          return;
        }
        sentinel = next;
      } catch {
        // Энергосбережение или отказ пользователя — экран просто гаснет как обычно.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
      sentinel = null;
    };
  }, [active]);
}

function elapsedSeconds(startedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
}

/** Цвета кубков топ-3 — те же, что на подиуме лидерборда. */
const RANK_TROPHY_COLOR: Record<number, string> = {
  1: 'text-citrus',
  2: 'text-silver',
  3: 'text-bronze',
};

/**
 * Содержимое бейджа карточки — по образцу StreakBadge: иконка 16 + число
 * tabular-nums, раскладку делает сам Badge. Топ-3 — кубок, дальше просто #N.
 */
function rankBadge(rank: number | null): React.ReactNode {
  if (rank === null) return undefined;
  if (RANK_TROPHY_COLOR[rank] === undefined) {
    return <span className="tabular-nums">#{rank}</span>;
  }
  return (
    <>
      <Icon name="trophy" size={16} />
      <span className="tabular-nums">#{rank}</span>
    </>
  );
}

/**
 * Загрузка — игровой загрузочный экран 8bitcn (блок loading-screen):
 * прогресс-бар и ротация советов из статического каталога хинтов — та же
 * метафора, что у ленты (п. 6.6). Прогресс декоративный: реального процента
 * у SWR-запроса нет, а экран живёт доли секунды.
 */
const LOADING_TIPS = STATIC_HINTS.map((hint) => hint.text);

function LoadingScreen() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-8">
      <LoadingScreenBlock
        title="ЗАГРУЗКА"
        tips={LOADING_TIPS}
        autoProgress
        autoProgressDuration={2000}
        tipInterval={4000}
      />
    </main>
  );
}

/** Прогулку уже закрыли с другого устройства: объясняем, а не мигаем пустотой. */
function NotFoundScreen({ onHome }: { onHome: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-6 px-4 py-8">
      <div className="pixel-panel flex flex-col items-center gap-4 p-6 text-center">
        <Icon name="walk" size={32} />
        <p className="font-pixel text-[16px] leading-relaxed text-text-main">ПРОГУЛКИ НЕТ</p>
        <p className="text-sm text-text-dim">
          Её уже завершили или отменили — возможно, с другого устройства. Возвращаем на главную.
        </p>
      </div>
      <div className="px-1.5">
        <Button type="button" onClick={onHome} className="min-h-11 w-full">
          На главную
        </Button>
      </div>
    </main>
  );
}

export default function WalkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [storedUserId, setStoredUserId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    try {
      setStoredUserId(window.localStorage.getItem(LAST_USER_STORAGE_KEY));
    } catch {
      setStoredUserId(null);
    }
  }, []);

  const { data: mine, isLoading } = useActiveWalk(storedUserId ?? null);
  const matched = mine !== undefined && mine !== null && mine.id === id ? mine : null;
  // Экран открыт на чужом устройстве или без записи в localStorage — активные
  // прогулки видны в /api/stats списком (п. 7.2), берём нужную оттуда.
  const needsFallback = storedUserId !== undefined && matched === null && !isLoading;
  const { data: stats } = useSWR<StatsDto>(needsFallback ? '/api/stats' : null, apiGet, {
    refreshInterval: 30_000,
  });

  const server: ActiveWalkDto | null =
    matched ?? stats?.activeWalks.find((item) => item.id === id) ?? null;

  // Ответ на смену скорости приходит раньше, чем SWR перечитает прогулку.
  // Отрезки только добавляются, поэтому «свежее» — та версия, где их больше;
  // как только SWR догоняет, снова побеждают серверные данные.
  const [changed, setChanged] = useState<ActiveWalkDto | null>(null);
  const walk: ActiveWalkDto | null =
    server !== null &&
    changed !== null &&
    changed.id === server.id &&
    changed.speedSegments.length > server.speedSegments.length
      ? changed
      : server;

  const { data: userStats } = useUserStats(walk?.userId ?? null);
  const [mode, setMode] = useState<DialogMode>('none');
  const [durationSec, setDurationSec] = useState(0);
  const [calculatedKm, setCalculatedKm] = useState(0);
  const [result, setResult] = useState<FinishWalkResultDto | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useWakeLock(walk !== null && result === null);

  const loading =
    result === null && walk === null && (storedUserId === undefined || isLoading || (needsFallback && stats === undefined));

  // Прогулки уже нет: завершена или отменена с другого устройства.
  useEffect(() => {
    if (loading || result !== null || walk !== null) return;
    router.replace('/');
  }, [loading, result, walk, router]);

  if (result !== null) return <WalkSuccess result={result} />;

  if (loading) return <LoadingScreen />;

  if (walk === null) return <NotFoundScreen onHome={() => router.replace('/')} />;

  const accidental = mode === 'accidental';

  const openFinish = () => {
    const now = Date.now();
    const seconds = elapsedSeconds(walk.startedAt);
    setDurationSec(seconds);
    // Дистанцию фиксируем тем же нажатием, что и время: считать её в модалке
    // значило бы дать ей идти дальше, пока человек правит число.
    setCalculatedKm(calcSegmentedDistanceKm(walk.speedSegments, now));
    setMode(seconds < SHORT_WALK_CANCEL_SEC ? 'accidental' : 'finish');
  };

  const cancelWalk = async () => {
    if (cancelling) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await apiSend<WalkDto>('POST', `/api/walks/${walk.id}/cancel`);
      await revalidateAfterWalk();
      router.replace('/');
    } catch (error: unknown) {
      setCancelError(
        error instanceof Error && error.message
          ? error.message
          : 'Не вышло отменить — проверьте связь и попробуйте ещё раз',
      );
      setCancelling(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 pt-6 pb-2">
      {/* Карточка игрока — блок 8bitcn player-profile-card. Бейдж — место
          в недельном рейтинге; топ-3 получает кубок в цвет подиума (п. 6.2),
          без единой прогулки за неделю бейджа нет. Бары HP/XP выключены —
          прогресс к рекорду уже показывает таймер. */}
      <header className="flex flex-col gap-3 px-1.5">
        {/* Строка старта — над карточкой, по центру; короткая метка,
            пиксельный шрифт уместен (п. 6.7.1). */}
        <p className="text-center font-pixel text-[10px] leading-relaxed text-text-dim">
          Старт в {formatTimeOfDay(walk.startedAt)} · {walk.treadmillName}
        </p>
        <PlayerProfileCard
          // Компактный вариант: базовый Card читает все припуски из
          // --card-spacing — 12px вместо 16px убирают лишний воздух.
          className="max-w-none [--card-spacing:0.75rem]"
          playerName={walk.user.name}
          avatarSrc={avatarSrc(walk.user.avatarId)}
          avatarFallback={walk.user.name.charAt(0).toUpperCase()}
          badge={rankBadge(userStats?.rank ?? null)}
          badgeVariant={userStats?.rank != null && userStats.rank <= 3 ? 'outline' : 'default'}
          badgeClassName={userStats?.rank != null ? RANK_TROPHY_COLOR[userStats.rank] : undefined}
          showLevel={userStats?.rank != null}
          showHealth={false}
          showMana={false}
          showExperience={false}
          // Полученные ачивки — строкой под именем, с тултипами (п. 6.8.3).
          belowName={<AchievementIcons achievements={userStats?.achievements ?? []} />}
        />
      </header>

      {/* Приглашение привязать Telegram — через минуту после старта, над таймером;
          появившись, висит до конца прогулки (п. 6.10.2). */}
      <TelegramNudge userId={walk.userId} startedAt={walk.startedAt} />

      <WalkTimer
        startedAt={walk.startedAt}
        speedSegments={walk.speedSegments}
        bestDayKm={userStats?.personalRecord.bestDayKm ?? null}
      />

      {/* Ходок стоит на «полотне»: две линии вместо рамки — панель здесь спорила бы
          с панелью хинтов, а спрайт должен читаться как единственная живая деталь.
          Регулятор скорости стоит здесь же: темп ходока меняется вместе с ним. */}
      <div className="flex flex-col items-center gap-4 border-y-[3px] border-border-dim py-4">
        <WalkerSprite speedKmh={walk.speedKmh} size={96} />
        <SpeedControl
          walkId={walk.id}
          speedKmh={walk.speedKmh}
          maxSpeedKmh={walk.treadmillMaxSpeedKmh}
          onChanged={setChanged}
          // В открытой модалке завершения дистанция уже зафиксирована: смена
          // скорости под ней разошлась бы с числом, которое человек правит.
          disabled={mode !== 'none'}
        />
      </div>

      {/* variant="walk": интервал 10 с и крупный шрифт — фразу читают с дорожки (п. 6.6.10). */}
      <HintTicker userId={walk.userId} variant="walk" />

      {/* Кнопки прижаты к низу и липнут к нему: на планшете у дорожки «End walk»
          должен быть под большим пальцем, а не уезжать под ленту хинтов. */}
      <div className="sticky bottom-0 mt-auto flex flex-col gap-4 bg-background px-1.5 pt-6 pb-3">
        <Button
          variant="default"
          size="lg"
          onClick={openFinish}
          type="button"
          className="min-h-14 w-full text-base"
        >
          <Icon name="finish" size={16} />
          End walk
        </Button>
        <Button
          variant="ghost"
          font="normal"
          onClick={() => setMode('cancel')}
          type="button"
          className="min-h-11 w-full text-sm text-text-dim"
        >
          Отменить прогулку
        </Button>
      </div>

      <FinishWalkDialog
        open={mode === 'finish'}
        walkId={walk.id}
        speedTrail={walk.speedSegments.map((segment) => segment.speedKmh)}
        calculatedKm={calculatedKm}
        durationSec={durationSec}
        onClose={() => setMode('none')}
        onFinished={(finished) => {
          setMode('none');
          setResult(finished);
        }}
      />

      {/* Подтверждение отмены. Короткая прогулка (< 10 с) ведёт сюда же: это
          почти всегда случайное нажатие, но сохранить всё равно разрешено (п. 7.5). */}
      <Dialog
        open={mode === 'cancel' || mode === 'accidental'}
        onOpenChange={(next: boolean) => {
          if (!next && !cancelling) setMode('none');
        }}
      >
        <DialogShell>
          <DialogHeader>
            <DialogTitle className="text-[16px] leading-relaxed">
              {accidental ? 'Меньше 10 секунд' : 'Отменить прогулку?'}
            </DialogTitle>
            <DialogDescription className="font-sans">
              {accidental ? 'Похоже на случайное нажатие. ' : ''}Прогулка не будет сохранена.
            </DialogDescription>
          </DialogHeader>

          {cancelError !== null ? (
            <p role="alert" className="text-sm text-citrus">
              {cancelError}
            </p>
          ) : null}

          <DialogFooter className="gap-3">
            <Button
              variant="secondary"
              onClick={() => setMode(accidental ? 'finish' : 'none')}
              type="button"
              className="min-h-11 w-full sm:w-auto"
            >
              {accidental ? 'Сохранить' : 'Иду дальше'}
            </Button>
            <Button
              variant="destructive"
              onClick={cancelWalk}
              disabled={cancelling}
              type="button"
              className="min-h-11 w-full sm:w-auto"
            >
              {cancelling ? 'Отменяем…' : 'Да, отменить'}
            </Button>
          </DialogFooter>
        </DialogShell>
      </Dialog>
    </main>
  );
}
