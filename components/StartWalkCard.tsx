'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { AddUserDialog } from '@/components/AddUserDialog';
import { SpeedPicker } from '@/components/SpeedPicker';
import { StartCountdown } from '@/components/StartCountdown';
import { TreadmillPicker, busyLabel, elapsedSec, useNowTick } from '@/components/TreadmillPicker';
import { UserSelect } from '@/components/UserSelect';
import { Button } from '@/components/ui/8bit/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/8bit/card';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/8bit/skeleton';
import {
  ApiError,
  apiGet,
  apiSend,
  primeActiveWalk,
  useTelegramStatus,
  useTreadmills,
  useUserStats,
} from '@/lib/client/api';
import { DEFAULT_SPEED_KMH, MAX_SPEED_KMH_ABS } from '@/lib/config';
import { formatDuration } from '@/lib/format';
import { fmt, m } from '@/lib/i18n';
import type { ActiveWalkDto, TreadmillBusyDto, TreadmillDto, UserDto } from '@/lib/types';

interface StartWalkCardProps {
  users: UserDto[];
  userId: string | null;
  onSelectUser: (userId: string) => void;
  /**
   * Countdown/start in progress. Home pauses its active-walk subscription
   * while true, so seeding the SWR cache before navigation doesn't trigger
   * its own redirect and race ours.
   */
  onStartFlowChange?: (active: boolean) => void;
}

/**
 * How long "GO!" stays on screen before navigation. Gives the prefetched
 * route payload time to land, so the push usually commits straight to the
 * walk screen without flashing the route-level loading screen.
 */
const GO_DWELL_MS = 400;

/** Walk start block: participant → treadmill → speed → «Start walk» (§ 6.1). */
export function StartWalkCard({
  users,
  userId,
  onSelectUser,
  onStartFlowChange,
}: StartWalkCardProps) {
  const router = useRouter();
  const { data: treadmills, isLoading, mutate: reloadTreadmills } = useTreadmills();
  const { data: userStats } = useUserStats(userId);

  const [treadmillId, setTreadmillId] = useState<string | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  // «Start walk» runs the 3-2-1 countdown first (§ 6.2); the POST fires at "GO!".
  const [counting, setCounting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The add-participant dialog lives here, not in `UserSelect`: the button that
  // opens it sits in the card header, i.e. outside the select's subtree.
  const [addOpen, setAddOpen] = useState(false);

  const list = treadmills ?? [];
  const free = list.filter((t) => t.busy === null);
  // Derive the value instead of only storing it in state: on the first frame
  // after treadmills load, the preselection effect has not run yet and the
  // button would flash "pick a treadmill".
  const activeTreadmillId = treadmillId ?? pickTreadmill(list, null, userStats?.lastTreadmillId);
  const selectedTreadmill = list.find((t) => t.id === activeTreadmillId) ?? null;
  // While no treadmill is selected (e.g. all busy) — cap by the first one in
  // the list, so the speed row does not grow to the absolute sanity limit.
  const maxSpeed = selectedTreadmill?.maxSpeedKmh ?? list[0]?.maxSpeedKmh ?? MAX_SPEED_KMH_ABS;
  const now = useNowTick(list.some((t) => t.busy !== null));

  // Warm the Telegram-status cache while the countdown runs: the walk screen
  // shows the invite panel from this data, and fetching it there after mount
  // would insert the panel late, shifting the layout under the user.
  useTelegramStatus(counting ? userId : null);

  // Treadmill preselection: the participant's last treadmill if free,
  // otherwise the first free one by sortOrder (§ 6.9.3).
  const pickedFor = useRef<string | null>(null);
  useEffect(() => {
    if (treadmills === undefined) return;
    const sameUser = pickedFor.current === userId;
    pickedFor.current = userId;
    setTreadmillId((prev) => pickTreadmill(treadmills, sameUser ? prev : null, userStats?.lastTreadmillId));
  }, [treadmills, userId, userStats?.lastTreadmillId]);

  // Speed preselection: last walk's speed, default for a new participant (§ 6.2).
  useEffect(() => {
    setSpeed(userId === null ? null : (userStats?.lastSpeedKmh ?? DEFAULT_SPEED_KMH));
  }, [userId, userStats?.lastSpeedKmh]);

  // Switched to a treadmill with a lower cap — clamp the chosen value (§ 6.9.3).
  useEffect(() => {
    setSpeed((prev) => (prev !== null && prev > maxSpeed ? maxSpeed : prev));
  }, [maxSpeed]);

  async function handleStart() {
    if (!userId || speed === null || starting) return; // double-press guard
    setStarting(true);
    setError(null);
    try {
      const walk = await apiSend<ActiveWalkDto>('POST', '/api/walks/start', {
        userId,
        speedKmh: speed,
        // Omit the treadmill when there is none: with a single active one the
        // server substitutes it itself (§ 6.9.2).
        ...(activeTreadmillId ? { treadmillId: activeTreadmillId } : {}),
      });
      // Seamless landing (§ 6.2): the walk screen renders from this cache
      // entry without a refetch, and prefetch + one "GO!" beat let the route
      // payload arrive so the push commits without a loading-screen flash.
      await primeActiveWalk(walk);
      router.prefetch(`/walk/${walk.id}`);
      await new Promise((resolve) => window.setTimeout(resolve, GO_DWELL_MS));
      router.push(`/walk/${walk.id}`);
    } catch (err) {
      // Drop the countdown overlay so the error is visible on the card.
      setCounting(false);
      onStartFlowChange?.(false);
      await handleStartError(err);
    } finally {
      setStarting(false);
    }
  }

  /** Both "conflict" 409 errors get a meaningful outcome, not an error text. */
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
      setError(m.startCard.treadmillJustTaken);
      return;
    }
    setError(
      err instanceof ApiError
        ? err.message
        : m.startCard.startFailed,
    );
  }

  if (isLoading) {
    return <StartWalkCardSkeleton />;
  }

  // The only scenario where starting is impossible at all (§ 6.9.6).
  if (list.length === 0) {
    return (
      <StartCard title={m.startCard.noTreadmillsTitle}>
        <div className="flex items-start gap-3">
          <Icon name="pin" size={16} className="mt-0.5" />
          <p className="text-sm text-text-dim">{m.startCard.noTreadmillsBody}</p>
        </div>
      </StartCard>
    );
  }

  const blocker = startBlocker(list, free, selectedTreadmill, now);
  const canStart = userId !== null && speed !== null && blocker === null;

  return (
    <StartCard title={m.startCard.title} action={<AddUserButton onClick={() => setAddOpen(true)} />}>
      <UserSelect users={users} value={userId} onChange={onSelectUser} />

      {users.length === 0 && (
        <p className="text-sm text-text-dim">{m.startCard.emptyTeam}</p>
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
          disabled={!canStart || starting || counting}
          onClick={() => {
            if (!canStart || starting || counting) return;
            setError(null);
            setCounting(true);
            onStartFlowChange?.(true);
          }}
        >
          {starting || counting ? (
            m.startCard.starting
          ) : (
            <>
              <Icon name="play" size={16} />
              {m.startCard.startWalk}
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

      {/* The overlay lives until navigation succeeds; `handleStart` closes it
          itself on error, so the message under the button is not covered. */}
      {counting && (
        <StartCountdown
          onGo={() => void handleStart()}
          onCancel={() => {
            setCounting(false);
            onStartFlowChange?.(false);
          }}
        />
      )}

      <AddUserDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        users={users}
        onCreated={(user) => onSelectUser(user.id)}
      />
    </StartCard>
  );
}

/**
 * Shared frame of the start block: pixel-font title, regular sans content —
 * otherwise names and labels inside the card become unreadable (§ 6.7.1).
 */
function StartCard({
  title,
  action,
  children,
}: {
  title: string;
  /** Right edge of the header: the add-participant button or its skeleton. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  // overflow-visible: the base shadcn card clips content by its own frame,
  // and the participant dropdown would be cut off at the card's bottom edge.
  return (
    <Card font="normal" className="overflow-visible">
      {/* items-center instead of the default items-start: a single-line title
          and the button align on a common middle line.

          `retro` is duplicated on purpose: `CardHeader` from 8bitcn spreads
          `{...props}` after the computed `className`, so any passed class
          wipes it entirely. While no className was passed, the header got
          `retro` by itself; now it has to be restored by hand. */}
      <CardHeader className="retro items-center">
        {/* text-sm on mobile: the pixel font is wide, «Старт прогулки» at 16px
            hits the edge of a 360 px screen (§ 6.7.2).
            `retro` in the class is mandatory — className in 8bitcn overrides it. */}
        <CardTitle className="retro text-sm leading-snug break-words sm:text-base">
          {title}
        </CardTitle>
        {/*
          `CardAction` is the standard shadcn slot: when present, `CardHeader`
          switches to `grid-cols-[1fr_auto]` and the slot goes into
          `col-start-2 justify-self-end`. A custom flex row here would do the
          same but bypass the header grid — and break once we add a description.
        */}
        {action && <CardAction className="self-center">{action}</CardAction>}
      </CardHeader>
      <CardContent font="normal" className="space-y-5">
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * The add-participant button in the card header is compact: the action is rare
 * (people are added once in a team's lifetime), and a big button would compete
 * in weight with «Start walk». `h-auto min-h-8` instead of a fixed height: the
 * 8-bit button's pixel frame hangs outside the box and adds 6 px on top and
 * bottom, a hard height would clip it. The label is pixel-font — it is an
 * action, not data (§ 6.7.1); narrow screens keep the short «Добавить», the
 * full text stays available to screen readers via `aria-label`.
 */
function AddUserButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={m.startCard.addUserFull}
      className="h-auto min-h-8 shrink-0 gap-1.5 px-2 text-[10px]"
      onClick={onClick}
    >
      <Icon name="plus" size={16} />
      <span className="sm:hidden">{m.startCard.addUserShort}</span>
      <span className="hidden sm:inline">{m.startCard.addUserFull}</span>
    </Button>
  );
}

/** Start-block placeholder: same frame, so the screen doesn't "jump" after load. */
export function StartWalkCardSkeleton() {
  return (
    <StartCard title={m.startCard.title} action={<Skeleton className="h-11 w-40" />}>
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

/** Why starting is impossible; `null` — it is possible. Busy state is visible before the press (§ 6.9.2). */
function startBlocker(
  list: TreadmillDto[],
  free: TreadmillDto[],
  selected: TreadmillDto | null,
  now: number,
): string | null {
  if (list.length === 1) {
    const busy = list[0].busy;
    if (busy) {
      return fmt(m.startCard.blockerSingleBusy, {
        name: busy.user.name,
        duration: formatDuration(elapsedSec(busy.startedAt, now)),
      });
    }
  }
  if (free.length === 0) {
    // The nearest release time is unknown, so show whoever has walked longest.
    const busyList = list
      .map((t) => t.busy)
      .filter((b): b is TreadmillBusyDto => b !== null)
      .sort((a, b) => elapsedSec(b.startedAt, now) - elapsedSec(a.startedAt, now));
    const tail = busyList[0] ? fmt(m.startCard.blockerAllBusyTail, { label: busyLabel(busyList[0], now) }) : '';
    return `${m.startCard.blockerAllBusy}${tail}`;
  }
  if (selected === null) return m.startCard.blockerChooseFree;
  if (selected.busy) return busyLabel(selected.busy, now);
  return null;
}

/** The participant's last treadmill if free; otherwise the first free one by sortOrder. */
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
