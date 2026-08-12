'use client';

import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { AchievementToast } from '@/components/AchievementToast';
import { StreakBadge } from '@/components/StreakBadge';
import { Badge } from '@/components/ui/8bit/badge';
import { Button } from '@/components/ui/8bit/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/8bit/card';
import { Icon } from '@/components/ui/icon';
import { apiSend, revalidateAfterWalk, useHints } from '@/lib/client/api';
import { DELETE_WINDOW_MINUTES } from '@/lib/config';
import { formatDuration, formatKm, plural } from '@/lib/format';
import type { FinishWalkResultDto } from '@/lib/types';

/**
 * Экран успеха (п. 6.4) — «уведомление о награде» (п. 6.7.5): прибавка, позиция,
 * серия, новые достижения. Всё рисуется из ответа `POST /finish` — второго запроса
 * за достижениями, серией и рейтингом нет по построению.
 *
 * Пиксельный шрифт — на прибавке, номере места и заголовках блоков. Названия
 * достижений, описания и хинт идут обычным sans: длинные русские строки в
 * bitmap-шрифте не помещаются в 360px (п. 6.7.1).
 */

const RECORD_ANIMATION_MS = 700;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Плавный набор числа: перерисовка текста, без анимации геометрии. */
function useCountUp(target: number): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const ratio = Math.min(1, (now - start) / RECORD_ANIMATION_MS);
      setValue(target * ratio);
      if (ratio < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return value;
}

/** Короткая метка места — пиксельная. Сама фраза о перемещении идёт ниже, sans. */
function rankDelta(rank: FinishWalkResultDto['rank']): string {
  const { current, previous } = rank;
  if (previous === null) return 'первая позиция в недельном рейтинге';
  if (previous > current) return `поднялись с ${previous} места в недельном рейтинге`;
  if (previous < current) return `опустились с ${previous} места в недельном рейтинге`;
  return 'позиция в недельном рейтинге не изменилась';
}

export function WalkSuccess({ result }: { result: FinishWalkResultDto }) {
  const router = useRouter();
  const { walk, newAchievements, streak, personalRecord } = result;
  const distanceKm = walk.distanceKm ?? 0;
  const shown = useCountUp(distanceKm);

  const { data: hints } = useHints(walk.userId);
  const hint = hints?.hints[0]?.text ?? null;

  const [secondsLeft, setSecondsLeft] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deadlineMs = useMemo(() => {
    const endedAt = walk.endedAt === null ? Date.now() : new Date(walk.endedAt).getTime();
    return endedAt + DELETE_WINDOW_MINUTES * 60_000;
  }, [walk.endedAt]);

  // Окно удаления считается от времени сервера; кнопка исчезает синхронно с 403.
  useEffect(() => {
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [deadlineMs]);

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiSend<{ ok: boolean }>('DELETE', `/api/walks/${walk.id}`);
      await revalidateAfterWalk();
      router.replace('/');
    } catch (error: unknown) {
      setDeleteError(
        error instanceof Error && error.message
          ? error.message
          : 'Запись удалить не вышло — окно в 15 минут могло уже закрыться',
      );
      setDeleting(false);
    }
  }

  const canDelete = walk.canDelete && secondsLeft > 0;
  const streakDays = Math.max(0, Math.floor(streak.days));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-4 py-8">
      {/* Анимируются только opacity и scale — transform, без reflow (п. 6.7.6). */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35 }}
        className="text-center"
      >
        <p className="font-pixel text-[32px] leading-none tabular-nums text-lime sm:text-[48px]">
          +{formatKm(shown)} км
        </p>
        <p className="mt-3 text-sm text-text-dim">
          {formatDuration(walk.durationSec ?? 0)} на дорожке «{walk.treadmillName}»
        </p>
      </motion.div>

      {/* `font="normal"` проставляется на каждом слоте: 8bitcn вешает `retro`
          на любой подкомпонент, которому его не передали явно. */}
      <Card font="normal">
        <CardHeader font="normal">
          <CardTitle className="text-[16px] leading-relaxed">
            {result.rank.current} МЕСТО
          </CardTitle>
          <CardDescription font="normal" className="font-sans">
            {rankDelta(result.rank)}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card font="normal">
        <CardHeader font="normal">
          <CardTitle className="text-[16px] leading-relaxed">СЕРИЯ</CardTitle>
        </CardHeader>
        <CardContent font="normal" className="flex flex-wrap items-center gap-3">
          <StreakBadge days={streakDays} />
          <span className="text-sm text-text-dim">
            {streakDays === 0
              ? 'серия начнётся со следующей прогулки'
              : `${streakDays} ${plural(streakDays, 'день', 'дня', 'дней')} подряд`}
            {streak.frozen ? ' · серию спасла заморозка' : ''}
          </span>
        </CardContent>
        <CardFooter font="normal">
          {personalRecord.isNew ? (
            <p className="flex items-center gap-2 text-sm text-lime">
              <Icon name="trophy" size={16} />
              Новый личный рекорд дня — {formatKm(personalRecord.bestDayKm)} км
            </p>
          ) : (
            <p className="text-sm text-text-dim">
              Лучший день — {formatKm(personalRecord.bestDayKm)} км
            </p>
          )}
        </CardFooter>
      </Card>

      {/* Тост всплывает и уходит, поэтому список наград дублируется текстом:
          экран успеха — единственное место, где их показывают целиком. */}
      {newAchievements.length > 0 ? (
        <>
          <AchievementToast achievements={newAchievements} />
          <Card font="normal">
            <CardHeader font="normal">
              <CardTitle className="text-[16px] leading-relaxed">НОВЫЕ НАГРАДЫ</CardTitle>
            </CardHeader>
            <CardContent font="normal">
              <ul className="space-y-4">
                {newAchievements.map((achievement) => (
                  <li key={achievement.code} className="space-y-2">
                    <div className="px-1.5">
                      <Badge font="normal" className="h-7">
                        <Icon name="star" size={16} />
                        {achievement.title}
                      </Badge>
                    </div>
                    <p className="text-sm text-text-dim">{achievement.description}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      ) : null}

      {hint !== null ? <p className="text-center text-sm text-text-dim">{hint}</p> : null}

      <div className="flex flex-col gap-4 px-1.5">
        <Button
          variant="default"
          size="lg"
          onClick={() => router.push('/')}
          type="button"
          className="min-h-14 w-full text-base"
        >
          На главную
        </Button>

        {canDelete ? (
          <Button
            variant="ghost"
            font="normal"
            onClick={remove}
            disabled={deleting}
            type="button"
            className="min-h-11 w-full text-sm tabular-nums text-text-dim"
          >
            {deleting ? 'Удаляем…' : `Отменить запись (${formatDuration(secondsLeft)})`}
          </Button>
        ) : null}

        {deleteError !== null ? (
          <p role="alert" className="text-center text-sm text-citrus">
            {deleteError}
          </p>
        ) : null}
      </div>
    </main>
  );
}
