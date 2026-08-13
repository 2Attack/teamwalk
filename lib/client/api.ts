'use client';

import useSWR, { type SWRConfiguration, mutate as globalMutate } from 'swr';

import type {
  ActiveWalkDto,
  AchievementDto,
  HintsResponseDto,
  LeaderboardDto,
  PeriodSelection,
  StatsDto,
  TeamProgressDto,
  TreadmillDto,
  UserDto,
  UserStatsDto,
  WalkDto,
} from '@/lib/types';

/** Ошибка API в конверте `{ error: { code, message, field } }` (п. 5 ТЗ). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function parse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const json: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const envelope = json as { error?: { code?: string; message?: string; field?: string } } | null;
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? 'INTERNAL_ERROR',
      envelope?.error?.message ?? 'Что-то пошло не так',
      envelope?.error?.field,
      json,
    );
  }

  return json as T;
}

export async function apiGet<T>(url: string): Promise<T> {
  return parse<T>(await fetch(url, { headers: { accept: 'application/json' } }));
}

export async function apiSend<T>(
  method: 'POST' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
): Promise<T> {
  return parse<T>(
    await fetch(url, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

export const fetcher = apiGet;

const LIVE: SWRConfiguration = { refreshInterval: 30_000, revalidateOnFocus: true };

export function useUsers() {
  return useSWR<UserDto[]>('/api/users', apiGet, { revalidateOnFocus: true });
}

export function useTreadmills() {
  return useSWR<TreadmillDto[]>('/api/treadmills', apiGet, { refreshInterval: 15_000 });
}

export function useActiveWalk(userId: string | null) {
  return useSWR<ActiveWalkDto | null>(
    userId ? `/api/walks/active?userId=${userId}` : null,
    apiGet,
    { refreshInterval: 20_000 },
  );
}

export function useLeaderboard(selection: PeriodSelection) {
  const key =
    selection.period === 'custom'
      ? `/api/leaderboard?period=custom&from=${selection.from}&to=${selection.to}`
      : `/api/leaderboard?period=${selection.period}`;
  return useSWR<LeaderboardDto>(key, apiGet, LIVE);
}

export function useStats() {
  return useSWR<StatsDto>('/api/stats', apiGet, LIVE);
}

export function useHints(userId: string | null) {
  return useSWR<HintsResponseDto>(
    userId ? `/api/hints?userId=${userId}` : '/api/hints',
    apiGet,
    { refreshInterval: 300_000, revalidateOnFocus: true },
  );
}

export function useUserStats(userId: string | null) {
  return useSWR<UserStatsDto>(userId ? `/api/users/${userId}/stats` : null, apiGet);
}

export function useTeamProgress() {
  return useSWR<TeamProgressDto>('/api/team/progress', apiGet, LIVE);
}

export function useUserWalks(userId: string | null, limit = 20) {
  return useSWR<WalkDto[]>(
    userId ? `/api/users/${userId}/walks?limit=${limit}` : null,
    apiGet,
  );
}

export function useAchievements(userId: string | null) {
  return useSWR<AchievementDto[]>(
    userId ? `/api/achievements?userId=${userId}` : '/api/achievements',
    apiGet,
  );
}

/** Инвалидация всего, на что влияет завершённая прогулка. */
export async function revalidateAfterWalk(): Promise<void> {
  await globalMutate(
    (key) =>
      typeof key === 'string' &&
      (key.startsWith('/api/leaderboard') ||
        key.startsWith('/api/stats') ||
        key.startsWith('/api/hints') ||
        key.startsWith('/api/treadmills') ||
        key.startsWith('/api/team') ||
        key.startsWith('/api/users')),
    undefined,
    { revalidate: true },
  );
}
