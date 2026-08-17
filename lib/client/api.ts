'use client';

import useSWR, { type SWRConfiguration, mutate as globalMutate } from 'swr';

import { m } from '@/lib/i18n';

import type {
  ActiveWalkDto,
  AchievementDto,
  HintsResponseDto,
  LeaderboardDto,
  PeriodSelection,
  RoutesAdminResponseDto,
  StatsDto,
  TeamProgressDto,
  TelegramStatusDto,
  TreadmillAdminDto,
  TreadmillDto,
  UserDto,
  UserStatsDto,
  WalkDto,
} from '@/lib/types';

/** API error in the `{ error: { code, message, field } }` envelope. */
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
    // Access cookie expired or PIN rotated mid-session: go unlock instead of
    // surfacing 401s into every SWR poll. Never resolves — navigation is in flight.
    if (
      response.status === 401 &&
      envelope?.error?.code === 'PIN_REQUIRED' &&
      typeof window !== 'undefined'
    ) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.assign(`/pin?next=${next}`);
      return new Promise<T>(() => {});
    }
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? 'INTERNAL_ERROR',
      envelope?.error?.message ?? m.api.clientFallback,
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

/** Route catalog for the settings screen. */
export function useRoutesAdmin() {
  return useSWR<RoutesAdminResponseDto>('/api/routes', apiGet, { revalidateOnFocus: true });
}

/** Full treadmill list for the settings screen, inactive included. */
export function useTreadmillsAdmin() {
  return useSWR<TreadmillAdminDto[]>('/api/treadmills?scope=all', apiGet, {
    revalidateOnFocus: true,
  });
}

export function useActiveWalk(userId: string | null) {
  return useSWR<ActiveWalkDto | null>(
    userId ? `/api/walks/active?userId=${userId}` : null,
    apiGet,
    { refreshInterval: 20_000 },
  );
}

/**
 * Single source of the leaderboard SWR key: the fireworks leader-change
 * detector uses it as the standings discriminator (specs/001, research D3).
 */
export function leaderboardKey(selection: PeriodSelection): string {
  return selection.period === 'custom'
    ? `/api/leaderboard?period=custom&from=${selection.from}&to=${selection.to}`
    : `/api/leaderboard?period=${selection.period}`;
}

export function useLeaderboard(selection: PeriodSelection) {
  return useSWR<LeaderboardDto>(leaderboardKey(selection), apiGet, LIVE);
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

/** Participant's Telegram status — for the card and the invite panel. */
export function useTelegramStatus(userId: string | null) {
  return useSWR<TelegramStatusDto>(userId ? `/api/users/${userId}/telegram` : null, apiGet, {
    revalidateOnFocus: true,
  });
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

/**
 * Seed the active-walk cache with a freshly started walk: the walk
 * screen then renders from cache instantly instead of refetching what the
 * start POST already returned. Home pauses its active-walk subscription for
 * the duration of the start flow, so seeding doesn't trigger its redirect.
 */
export async function primeActiveWalk(walk: ActiveWalkDto): Promise<void> {
  await globalMutate(`/api/walks/active?userId=${walk.userId}`, walk, { revalidate: false });
}

/**
 * Invalidate routes after settings CRUD: the admin list plus
 * everything derived from the active route — team progress and hints.
 */
export async function revalidateRoutes(): Promise<void> {
  await globalMutate(
    (key) =>
      typeof key === 'string' &&
      (key.startsWith('/api/routes') ||
        key.startsWith('/api/team/progress') ||
        key.startsWith('/api/hints')),
    undefined,
    { revalidate: true },
  );
}

/**
 * Invalidate both treadmill lists after settings CRUD: the
 * admin list on the settings screen and the picker in the start block.
 */
export async function revalidateTreadmills(): Promise<void> {
  await globalMutate(
    (key) => typeof key === 'string' && key.startsWith('/api/treadmills'),
    undefined,
    { revalidate: true },
  );
}

/** Invalidate everything a finished walk affects. */
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
