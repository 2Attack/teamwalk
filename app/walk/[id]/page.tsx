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
import { fmt, m } from '@/lib/i18n';
import type { ActiveWalkDto, FinishWalkResultDto, StatsDto, WalkDto } from '@/lib/types';

/**
 * Active walk screen (§ 6.3) — HUD: avatar and name, a large timer, running
 * distance, day record, the walker, the hint ticker and buttons at the
 * bottom, in the thumb zone (§ 6.7.5).
 */

type DialogMode = 'none' | 'finish' | 'accidental' | 'cancel';

/**
 * Wake Lock: the tablet stands by the treadmill, a dimming screen hides the
 * timer. The API is not everywhere and revokes when the tab goes background —
 * both cases are routine.
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
        // Power saving or user refusal — the screen just dims as usual.
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

/** Top-3 trophy colors — same as on the leaderboard podium. */
const RANK_TROPHY_COLOR: Record<number, string> = {
  1: 'text-citrus',
  2: 'text-silver',
  3: 'text-bronze',
};

/**
 * Card badge content — modeled on StreakBadge: 16px icon + tabular-nums
 * number, the Badge does the layout. Top-3 gets a trophy, below that just #N.
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
 * Loading — the 8bitcn game loading screen (loading-screen block): progress
 * bar and rotating tips from the static hint catalog — same metaphor as the
 * ticker (§ 6.6). The progress is decorative: the SWR request has no real
 * percentage and the screen lives a fraction of a second.
 */
const LOADING_TIPS = STATIC_HINTS.map((hint) => hint.text);

/**
 * Grace delay before showing the loading block. The start flow lands here
 * with the active walk already seeded into the SWR cache, so data resolves
 * within a frame or two — flashing the full loading screen for that moment
 * is exactly the jank we want to avoid. A quiet dark frame bridges the gap;
 * genuinely slow loads (cold direct opens) still get the block.
 */
const LOADER_GRACE_MS = 250;

function LoadingScreen() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), LOADER_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return <main className="min-h-dvh" />;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-8">
      <LoadingScreenBlock
        title={m.common.loading}
        tips={LOADING_TIPS}
        autoProgress
        autoProgressDuration={2000}
        tipInterval={4000}
      />
    </main>
  );
}

/** The walk was already closed from another device: explain instead of blinking emptiness. */
function NotFoundScreen({ onHome }: { onHome: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-6 px-4 py-8">
      <div className="pixel-panel flex flex-col items-center gap-4 p-6 text-center">
        <Icon name="walk" size={32} />
        <p className="font-pixel text-[16px] leading-relaxed text-text-main">
          {m.walk.notFoundTitle}
        </p>
        <p className="text-sm text-text-dim">{m.walk.notFoundBody}</p>
      </div>
      <div className="px-1.5">
        <Button type="button" onClick={onHome} className="min-h-11 w-full">
          {m.common.home}
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
  // The screen was opened on someone else's device or without a localStorage
  // record — active walks are listed in /api/stats (§ 7.2), take it from there.
  const needsFallback = storedUserId !== undefined && matched === null && !isLoading;
  const { data: stats } = useSWR<StatsDto>(needsFallback ? '/api/stats' : null, apiGet, {
    refreshInterval: 30_000,
  });

  const server: ActiveWalkDto | null =
    matched ?? stats?.activeWalks.find((item) => item.id === id) ?? null;

  // The speed-change response arrives before SWR rereads the walk. Segments
  // are append-only, so the "fresher" version is the one with more of them;
  // as soon as SWR catches up, server data wins again.
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

  // The walk is gone: finished or cancelled from another device.
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
    // Distance is fixed by the same press as the time: computing it in the
    // dialog would let it keep running while the person edits the number.
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
          : m.walk.cancelFailed,
      );
      setCancelling(false);
    }
  };

  return (
    // animate-screen-in: a short stepped fade instead of a hard cut — the HUD
    // usually appears straight after the start countdown's dark "GO!" frame.
    <main className="animate-screen-in mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 pt-6 pb-2">
      {/* Player card — the 8bitcn player-profile-card block. The badge is the
          weekly-rank position; top-3 gets a trophy in podium colors (§ 6.2),
          no badge without a single walk this week. HP/XP bars are off —
          progress toward the record is already shown by the timer. */}
      <header className="flex flex-col gap-3 px-1.5">
        {/* Start line — above the card, centered; a short label, the pixel
            font is appropriate (§ 6.7.1). */}
        <p className="text-center font-pixel text-[10px] leading-relaxed text-text-dim">
          {fmt(m.walk.startLine, {
            time: formatTimeOfDay(walk.startedAt),
            treadmill: walk.treadmillName,
          })}
        </p>
        <PlayerProfileCard
          // Compact variant: the base Card reads all spacing from
          // --card-spacing — 12px instead of 16px removes the extra air.
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
          // Earned achievements — a row under the name, with tooltips (§ 6.8.3).
          belowName={<AchievementIcons achievements={userStats?.achievements ?? []} />}
        />
      </header>

      {/* Telegram link invite — above the timer; always visible while the
          participant is not linked (§ 6.10.2). */}
      <TelegramNudge userId={walk.userId} />

      <WalkTimer
        startedAt={walk.startedAt}
        speedSegments={walk.speedSegments}
        bestDayKm={userStats?.personalRecord.bestDayKm ?? null}
      />

      {/* The walker stands on a "canvas": two lines instead of a frame — a
          panel here would compete with the hints panel, and the sprite should
          read as the only living detail. The speed control sits right here:
          the walker's pace changes together with it. */}
      <div className="flex flex-col items-center gap-4 border-y-[3px] border-border-dim py-4">
        <WalkerSprite speedKmh={walk.speedKmh} size={96} />
        <SpeedControl
          walkId={walk.id}
          speedKmh={walk.speedKmh}
          maxSpeedKmh={walk.treadmillMaxSpeedKmh}
          onChanged={setChanged}
          // In an open finish dialog the distance is already fixed: changing
          // speed under it would diverge from the number the person is editing.
          disabled={mode !== 'none'}
        />
      </div>

      {/* variant="walk": 10 s interval and larger font — the phrase is read from the treadmill (§ 6.6.10). */}
      <HintTicker userId={walk.userId} variant="walk" />

      {/* Buttons pinned and sticky at the bottom: on the tablet by the
          treadmill "End walk" must sit under the thumb, not slide under the
          hint ticker. */}
      <div className="sticky bottom-0 mt-auto flex flex-col gap-4 bg-background px-1.5 pt-6 pb-3">
        <Button
          variant="default"
          size="lg"
          onClick={openFinish}
          type="button"
          className="min-h-14 w-full text-base"
        >
          <Icon name="finish" size={16} />
          {m.walk.endWalk}
        </Button>
        <Button
          variant="ghost"
          font="normal"
          onClick={() => setMode('cancel')}
          type="button"
          className="min-h-11 w-full text-sm text-text-dim"
        >
          {m.walk.cancelWalk}
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

      {/* Cancel confirmation. A short walk (< 10 s) leads here too: it is
          almost always an accidental press, but saving is still allowed (§ 7.5). */}
      <Dialog
        open={mode === 'cancel' || mode === 'accidental'}
        onOpenChange={(next: boolean) => {
          if (!next && !cancelling) setMode('none');
        }}
      >
        <DialogShell>
          <DialogHeader>
            <DialogTitle className="text-[16px] leading-relaxed">
              {accidental
                ? fmt(m.walk.accidentalTitle, { seconds: SHORT_WALK_CANCEL_SEC })
                : m.walk.cancelTitle}
            </DialogTitle>
            <DialogDescription className="font-sans">
              {accidental ? m.walk.accidentalNote : ''}
              {m.walk.willNotBeSaved}
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
              {accidental ? m.common.save : m.walk.keepWalking}
            </Button>
            <Button
              variant="destructive"
              onClick={cancelWalk}
              disabled={cancelling}
              type="button"
              className="min-h-11 w-full sm:w-auto"
            >
              {cancelling ? m.walk.cancelling : m.walk.confirmCancel}
            </Button>
          </DialogFooter>
        </DialogShell>
      </Dialog>
    </main>
  );
}
