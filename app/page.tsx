'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AppHeader } from '@/components/AppHeader';
import { HintTicker } from '@/components/HintTicker';
import { Leaderboard } from '@/components/Leaderboard';
import { PeriodTabs } from '@/components/PeriodTabs';
import { Podium } from '@/components/Podium';
import { StartWalkCard, StartWalkCardSkeleton } from '@/components/StartWalkCard';
import { TeamProgress } from '@/components/TeamProgress';
import { Button } from '@/components/ui/8bit/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/8bit/card';
import { useActiveWalk, useUsers } from '@/lib/client/api';
import { LAST_USER_STORAGE_KEY } from '@/lib/config';
import type { Period } from '@/lib/types';

/**
 * Главная (п. 6.1): шапка → лента хинтов → прогресс команды → блок старта →
 * пьедестал → период + таблица лидеров.
 *
 * Период живёт здесь и общий для пьедестала и таблицы: иначе на экране
 * висели бы два противоречащих топ-3 (п. 6.2).
 */
export default function HomePage() {
  const router = useRouter();
  const { data: users, error, isLoading, mutate: reloadUsers } = useUsers();

  const [period, setPeriod] = useState<Period>('week');
  const [userId, setUserId] = useState<string | null>(null);
  /** До первого эффекта localStorage не читаем — иначе разъедется гидратация. */
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    setUserId(readLastUserId());
    setRestored(true);
  }, []);

  // Сохраняем выбор: на общем планшете это экономит шаг, на телефоне работает как «вход».
  useEffect(() => {
    if (!restored) return;
    try {
      if (userId) window.localStorage.setItem(LAST_USER_STORAGE_KEY, userId);
      else window.localStorage.removeItem(LAST_USER_STORAGE_KEY);
    } catch {
      // Приватный режим/переполнение — не повод ронять экран.
    }
  }, [restored, userId]);

  // Участника могли удалить из БД — тогда сохранённый id больше не выбор.
  useEffect(() => {
    if (!restored || !users || userId === null) return;
    if (!users.some((u) => u.id === userId)) setUserId(null);
  }, [restored, users, userId]);

  // Если у выбранного участника уже идёт прогулка — сразу её экран (п. 6.3).
  const { data: activeWalk } = useActiveWalk(restored ? userId : null);
  useEffect(() => {
    if (activeWalk) router.replace(`/walk/${activeWalk.id}`);
  }, [activeWalk, router]);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 sm:py-8">
      <AppHeader />
      <HintTicker userId={userId} />
      <TeamProgress />

      {error ? (
        <NetworkError onRetry={() => void reloadUsers()} />
      ) : isLoading || !users ? (
        <StartWalkCardSkeleton />
      ) : (
        <StartWalkCard users={users} userId={userId} onSelectUser={setUserId} />
      )}

      <Podium period={period} currentUserId={userId} />

      <section className="space-y-4">
        <PeriodTabs value={period} onChange={setPeriod} />
        <Leaderboard period={period} currentUserId={userId} />
      </section>
    </main>
  );
}

/** Сеть отвалилась: понятный текст и явная кнопка повтора вместо пустого экрана. */
function NetworkError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card font="normal">
      <CardHeader>
        {/* `retro` в классе обязателен: className в 8bitcn перекрывает его. */}
        <CardTitle className="retro text-sm leading-snug break-words sm:text-base">
          Нет связи с сервером
        </CardTitle>
      </CardHeader>
      <CardContent font="normal" className="space-y-4">
        <p className="text-sm text-text-dim">
          Не удалось загрузить список участников. Проверьте подключение и повторите.
        </p>
        <Button type="button" className="min-h-11 text-xs" onClick={onRetry}>
          Повторить
        </Button>
      </CardContent>
    </Card>
  );
}

/** Последний выбранный участник из localStorage; ошибки хранилища не роняют экран. */
function readLastUserId(): string | null {
  try {
    return window.localStorage.getItem(LAST_USER_STORAGE_KEY);
  } catch {
    return null;
  }
}
