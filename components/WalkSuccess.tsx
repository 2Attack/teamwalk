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
import { achievementIcon } from '@/lib/achievement-icons';
import { apiSend, revalidateAfterWalk, useHints } from '@/lib/client/api';
import { DELETE_WINDOW_MINUTES } from '@/lib/config';
import { formatDuration, formatKm } from '@/lib/format';
import { fmt, m, plural } from '@/lib/i18n';
import type { FinishWalkResultDto } from '@/lib/types';

/**
 * Success screen — the "award notification": gain,
 * rank, streak, new achievements. All rendered from the `POST /finish`
 * response — by construction there is no second request for achievements,
 * streak, or rank.
 *
 * Pixel font on the gain, rank number, and block titles. Achievement titles,
 * descriptions, and the hint are regular sans: long Russian strings in a
 * bitmap font don't fit 360px.
 */

const RECORD_ANIMATION_MS = 700;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Smooth number count-up: text repaint, no geometry animation. */
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

/** Short rank label — pixel font. The movement phrase itself goes below, sans. */
function rankDelta(rank: FinishWalkResultDto['rank']): string {
  const { current, previous } = rank;
  if (previous === null) return m.walkSuccess.rankFirst;
  if (previous > current) return fmt(m.walkSuccess.rankUp, { previous });
  if (previous < current) return fmt(m.walkSuccess.rankDown, { previous });
  return m.walkSuccess.rankSame;
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

  // The delete window counts from server time; the button vanishes in sync with the 403.
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
          : fmt(m.walkSuccess.deleteFailed, { minutes: DELETE_WINDOW_MINUTES }),
      );
      setDeleting(false);
    }
  }

  const canDelete = walk.canDelete && secondsLeft > 0;
  const streakDays = Math.max(0, Math.floor(streak.days));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-4 py-8">
      {/* Only opacity and scale animate — transform, no reflow. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35 }}
        className="text-center"
      >
        <p className="font-pixel text-[32px] leading-none tabular-nums text-lime sm:text-[48px]">
          +{formatKm(shown)} {m.units.km}
        </p>
        <p className="mt-3 text-sm text-text-dim">
          {fmt(m.walkSuccess.durationOnTreadmill, {
            duration: formatDuration(walk.durationSec ?? 0),
            treadmill: walk.treadmillName,
          })}
        </p>
      </motion.div>

      {/* `font="normal"` is set on every slot: 8bitcn applies `retro` to any
          subcomponent that doesn't receive it explicitly. */}
      <Card font="normal">
        <CardHeader font="normal">
          <CardTitle className="text-[16px] leading-relaxed">
            {fmt(m.walkSuccess.placeTitle, { rank: result.rank.current })}
          </CardTitle>
          <CardDescription font="normal" className="font-sans">
            {rankDelta(result.rank)}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card font="normal">
        <CardHeader font="normal">
          <CardTitle className="text-[16px] leading-relaxed">{m.walkSuccess.streakTitle}</CardTitle>
        </CardHeader>
        <CardContent font="normal" className="flex flex-wrap items-center gap-3">
          <StreakBadge days={streakDays} />
          <span className="text-sm text-text-dim">
            {streakDays === 0
              ? m.walkSuccess.streakNone
              : plural(m.walkSuccess.streakDays, streakDays)}
            {streak.frozen ? m.walkSuccess.streakFrozen : ''}
          </span>
        </CardContent>
        <CardFooter font="normal">
          {personalRecord.isNew ? (
            <p className="flex items-center gap-2 text-sm text-lime">
              <Icon name="trophy" size={16} />
              {fmt(m.walkSuccess.newDayRecord, { km: formatKm(personalRecord.bestDayKm) })}
            </p>
          ) : (
            <p className="text-sm text-text-dim">
              {fmt(m.walkSuccess.bestDay, { km: formatKm(personalRecord.bestDayKm) })}
            </p>
          )}
        </CardFooter>
      </Card>

      {/* The toast comes and goes, so the award list is duplicated as text:
          the success screen is the only place showing them in full. */}
      {newAchievements.length > 0 ? (
        <>
          <AchievementToast achievements={newAchievements} />
          <Card font="normal">
            <CardHeader font="normal">
              <CardTitle className="text-[16px] leading-relaxed">{m.walkSuccess.newAwardsTitle}</CardTitle>
            </CardHeader>
            <CardContent font="normal">
              <ul className="space-y-4">
                {newAchievements.map((achievement) => (
                  <li key={achievement.code} className="space-y-2">
                    <div className="px-1.5">
                      <Badge font="normal" className="h-7">
                        {/* Each achievement has its own pixel icon. */}
                        <Icon name={achievementIcon(achievement.code)} size={16} />
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
          {m.common.home}
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
            {deleting ? m.common.deleting : fmt(m.walkSuccess.deleteEntry, { timer: formatDuration(secondsLeft) })}
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
