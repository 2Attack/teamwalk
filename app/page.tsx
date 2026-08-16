'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AppHeader } from '@/components/AppHeader';
import { Leaderboard } from '@/components/Leaderboard';
import { PeriodTabs } from '@/components/PeriodTabs';
import { Podium } from '@/components/Podium';
import { StartWalkCard, StartWalkCardSkeleton } from '@/components/StartWalkCard';
import { TeamProgress } from '@/components/TeamProgress';
import { Button } from '@/components/ui/8bit/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/8bit/card';
import { useActiveWalk, useUsers } from '@/lib/client/api';
import { LAST_USER_STORAGE_KEY } from '@/lib/config';
import { m } from '@/lib/i18n';
import type { PeriodSelection } from '@/lib/types';

/**
 * Home: header → team progress → start block → podium → period +
 * leaderboard.
 *
 * The period lives here and is shared by the podium and the table: otherwise
 * two contradicting top-3s would hang on screen at once.
 */
export default function HomePage() {
  const router = useRouter();
  const { data: users, error, isLoading, mutate: reloadUsers } = useUsers();

  const [period, setPeriod] = useState<PeriodSelection>({ period: 'week' });
  const [userId, setUserId] = useState<string | null>(null);
  /** Don't read localStorage before the first effect — hydration would diverge. */
  const [restored, setRestored] = useState(false);
  // The start flow (countdown → POST → navigation) owns the redirect while it
  // runs: it seeds the active-walk SWR cache before navigating, and the
  // auto-redirect below reacting to that would race it with a second
  // navigation. Pausing the subscription keeps exactly one navigator.
  const [startFlowActive, setStartFlowActive] = useState(false);

  useEffect(() => {
    setUserId(readLastUserId());
    setRestored(true);
  }, []);

  // Persist the choice: saves a step on the shared tablet, acts as "login" on a phone.
  useEffect(() => {
    if (!restored) return;
    try {
      if (userId) window.localStorage.setItem(LAST_USER_STORAGE_KEY, userId);
      else window.localStorage.removeItem(LAST_USER_STORAGE_KEY);
    } catch {
      // Private mode / quota — no reason to crash the screen.
    }
  }, [restored, userId]);

  // The participant may have been deleted from the DB — then the saved id is no longer a choice.
  useEffect(() => {
    if (!restored || !users || userId === null) return;
    if (!users.some((u) => u.id === userId)) setUserId(null);
  }, [restored, users, userId]);

  // If the selected participant already has a walk in progress — straight to its screen.
  const { data: activeWalk } = useActiveWalk(restored && !startFlowActive ? userId : null);
  useEffect(() => {
    if (activeWalk) router.replace(`/walk/${activeWalk.id}`);
  }, [activeWalk, router]);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 sm:py-8">
      <AppHeader />
      {/* The hint ticker is removed from home: it stays on the walk screen,
          where a person actually watches the screen for minutes. */}
      <TeamProgress />

      {error ? (
        <NetworkError onRetry={() => void reloadUsers()} />
      ) : isLoading || !users ? (
        <StartWalkCardSkeleton />
      ) : (
        <StartWalkCard
          users={users}
          userId={userId}
          onSelectUser={setUserId}
          onStartFlowChange={setStartFlowActive}
        />
      )}

      <Podium period={period} currentUserId={userId} />

      <section className="space-y-4">
        <PeriodTabs value={period} onChange={setPeriod} />
        <Leaderboard period={period} currentUserId={userId} />
      </section>
    </main>
  );
}

/** Network is down: a clear text and an explicit retry button instead of an empty screen. */
function NetworkError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card font="normal">
      <CardHeader>
        {/* `retro` in the class is mandatory: className in 8bitcn overrides it. */}
        <CardTitle className="retro text-sm leading-snug break-words sm:text-base">
          {m.home.networkErrorTitle}
        </CardTitle>
      </CardHeader>
      <CardContent font="normal" className="space-y-4">
        <p className="text-sm text-text-dim">{m.home.networkErrorBody}</p>
        <Button type="button" className="min-h-11 text-xs" onClick={onRetry}>
          {m.common.retry}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Last selected participant from localStorage; storage errors don't crash the screen. */
function readLastUserId(): string | null {
  try {
    return window.localStorage.getItem(LAST_USER_STORAGE_KEY);
  } catch {
    return null;
  }
}
