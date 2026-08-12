import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { DELETE_WINDOW_MINUTES } from '@/lib/config';
import { db } from '@/lib/db';
import { treadmills, users, walkSpeedSegments, walks } from '@/lib/db/schema';
import type {
  ActiveWalkDto,
  TreadmillDto,
  WalkDto,
  WalkSpeedSegmentDto,
  WalkStatus,
} from '@/lib/types';

/**
 * Запросы зоны WALKS. Ни один из них не предполагает, что активная прогулка
 * в системе одна: активных ровно столько, сколько занятых дорожек (п. 7.2).
 */

interface ActiveRow {
  id: string;
  userId: string;
  treadmillId: string;
  treadmillName: string;
  treadmillMaxSpeedKmh: number;
  startedAt: Date;
  speedKmh: number;
  userName: string;
  userAvatarId: string;
  userHintsOptOut: boolean;
}

interface WalkRow {
  id: string;
  userId: string;
  treadmillId: string;
  treadmillName: string;
  startedAt: Date;
  endedAt: Date | null;
  durationSec: number | null;
  distanceKm: string | null;
  speedKmh: number;
  status: WalkStatus;
}

const activeColumns = {
  id: walks.id,
  userId: walks.userId,
  treadmillId: walks.treadmillId,
  treadmillName: treadmills.name,
  treadmillMaxSpeedKmh: treadmills.maxSpeedKmh,
  startedAt: walks.startedAt,
  speedKmh: walks.speedKmh,
  userName: users.name,
  userAvatarId: users.avatarId,
  userHintsOptOut: users.hintsOptOut,
};

const walkColumns = {
  id: walks.id,
  userId: walks.userId,
  treadmillId: walks.treadmillId,
  treadmillName: treadmills.name,
  startedAt: walks.startedAt,
  endedAt: walks.endedAt,
  durationSec: walks.durationSec,
  distanceKm: walks.distanceKm,
  speedKmh: walks.speedKmh,
  status: walks.status,
};

/**
 * Смены скорости для перечисленных прогулок (п. 6.3).
 *
 * Стартовый отрезок в таблице не хранится — он собирается из `walks`, поэтому
 * прогулка без единой смены скорости не даёт здесь ни одной строки, а старые
 * записи работают без бэкфилла.
 */
async function loadSpeedChanges(walkIds: string[]): Promise<Map<string, WalkSpeedSegmentDto[]>> {
  const byWalk = new Map<string, WalkSpeedSegmentDto[]>();
  if (walkIds.length === 0) return byWalk;

  const rows = await db
    .select({
      walkId: walkSpeedSegments.walkId,
      speedKmh: walkSpeedSegments.speedKmh,
      startedAt: walkSpeedSegments.startedAt,
    })
    .from(walkSpeedSegments)
    .where(inArray(walkSpeedSegments.walkId, walkIds))
    .orderBy(asc(walkSpeedSegments.startedAt));

  for (const row of rows) {
    const list = byWalk.get(row.walkId) ?? [];
    list.push({ speedKmh: Number(row.speedKmh), startedAt: row.startedAt.toISOString() });
    byWalk.set(row.walkId, list);
  }

  return byWalk;
}

function toActiveWalk(row: ActiveRow, changes: WalkSpeedSegmentDto[] = []): ActiveWalkDto {
  // Первый отрезок — скорость старта; дальше идут смены в порядке времени.
  const speedSegments: WalkSpeedSegmentDto[] = [
    { speedKmh: Number(row.speedKmh), startedAt: row.startedAt.toISOString() },
    ...changes,
  ];

  return {
    id: row.id,
    userId: row.userId,
    treadmillId: row.treadmillId,
    treadmillName: row.treadmillName,
    treadmillMaxSpeedKmh: Number(row.treadmillMaxSpeedKmh),
    startedAt: row.startedAt.toISOString(),
    // Наружу отдаём текущую скорость, а не стартовую: её показывают на экране.
    speedKmh: speedSegments[speedSegments.length - 1].speedKmh,
    speedSegments,
    user: {
      id: row.userId,
      name: row.userName,
      avatarId: row.userAvatarId,
      hintsOptOut: row.userHintsOptOut,
    },
  };
}

/** Окно удаления (п. 7.7): 15 минут с момента `ended_at`. */
export function canDeleteWalk(endedAt: Date | null): boolean {
  if (!endedAt) return false;
  return Date.now() - endedAt.getTime() <= DELETE_WINDOW_MINUTES * 60_000;
}

function toWalk(row: WalkRow): WalkDto {
  return {
    id: row.id,
    userId: row.userId,
    treadmillId: row.treadmillId,
    treadmillName: row.treadmillName,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    durationSec: row.durationSec === null ? null : Number(row.durationSec),
    // numeric приходит строкой — приводим к числу перед выдачей клиенту.
    distanceKm: row.distanceKm === null ? null : Number(row.distanceKm),
    speedKmh: Number(row.speedKmh),
    status: row.status,
    canDelete: canDeleteWalk(row.endedAt),
  };
}

/** Активная прогулка участника (п. 7.1 — она максимум одна). */
export async function getActiveWalk(userId: string): Promise<ActiveWalkDto | null> {
  const rows = await db
    .select(activeColumns)
    .from(walks)
    .innerJoin(treadmills, eq(treadmills.id, walks.treadmillId))
    .innerJoin(users, eq(users.id, walks.userId))
    .where(and(eq(walks.userId, userId), eq(walks.status, 'active')))
    .limit(1);

  if (!rows[0]) return null;
  return toActiveWalk(rows[0], (await loadSpeedChanges([rows[0].id])).get(rows[0].id));
}

/** Активная прогулка по её id — для экрана прогулки и смены скорости. */
export async function getActiveWalkById(walkId: string): Promise<ActiveWalkDto | null> {
  const rows = await db
    .select(activeColumns)
    .from(walks)
    .innerJoin(treadmills, eq(treadmills.id, walks.treadmillId))
    .innerJoin(users, eq(users.id, walks.userId))
    .where(and(eq(walks.id, walkId), eq(walks.status, 'active')))
    .limit(1);

  if (!rows[0]) return null;
  return toActiveWalk(rows[0], (await loadSpeedChanges([walkId])).get(walkId));
}

/** Все активные прогулки: по одной на занятую дорожку (п. 7.2). */
export async function listActiveWalks(): Promise<ActiveWalkDto[]> {
  const rows = await db
    .select(activeColumns)
    .from(walks)
    .innerJoin(treadmills, eq(treadmills.id, walks.treadmillId))
    .innerJoin(users, eq(users.id, walks.userId))
    .where(eq(walks.status, 'active'))
    .orderBy(asc(walks.startedAt));

  // Один запрос на все прогулки сразу, а не N+1 по каждой.
  const changes = await loadSpeedChanges(rows.map((row) => row.id));
  return rows.map((row) => toActiveWalk(row, changes.get(row.id)));
}

/** История участника — свежие сверху. */
export async function listUserWalks(userId: string, limit: number): Promise<WalkDto[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 0, 1), 200);
  const rows = await db
    .select(walkColumns)
    .from(walks)
    .innerJoin(treadmills, eq(treadmills.id, walks.treadmillId))
    .where(eq(walks.userId, userId))
    .orderBy(desc(walks.startedAt))
    .limit(safeLimit);

  return rows.map(toWalk);
}

export async function getWalkById(id: string): Promise<WalkDto | null> {
  const rows = await db
    .select(walkColumns)
    .from(walks)
    .innerJoin(treadmills, eq(treadmills.id, walks.treadmillId))
    .where(eq(walks.id, id))
    .limit(1);

  return rows[0] ? toWalk(rows[0]) : null;
}

/** Дорожка по id — вместе с `isActive`, чтобы отличить «нет такой» от «выключена». */
export async function getTreadmillById(id: string): Promise<{
  id: string;
  name: string;
  maxSpeedKmh: number;
  sortOrder: number;
  isActive: boolean;
} | null> {
  const rows = await db
    .select({
      id: treadmills.id,
      name: treadmills.name,
      maxSpeedKmh: treadmills.maxSpeedKmh,
      sortOrder: treadmills.sortOrder,
      isActive: treadmills.isActive,
    })
    .from(treadmills)
    .where(eq(treadmills.id, id))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Активные дорожки с текущей занятостью. Занятость приходит одним запросом
 * (left join по активной прогулке), а не N+1 подзапросами.
 */
export async function listActiveTreadmills(): Promise<TreadmillDto[]> {
  const rows = await db
    .select({
      id: treadmills.id,
      name: treadmills.name,
      maxSpeedKmh: treadmills.maxSpeedKmh,
      sortOrder: treadmills.sortOrder,
      walkId: walks.id,
      startedAt: walks.startedAt,
      // Текущая скорость: последняя смена, а при её отсутствии — скорость старта.
      // Коррелированный подзапрос вместо ещё одного join: строка на дорожку одна.
      speedKmh: sql<number | null>`coalesce((
        select seg.speed_kmh
        from walk_speed_segments seg
        where seg.walk_id = ${walks.id}
        order by seg.started_at desc
        limit 1
      ), ${walks.speedKmh})`,
      userId: users.id,
      userName: users.name,
      userAvatarId: users.avatarId,
    })
    .from(treadmills)
    .leftJoin(walks, and(eq(walks.treadmillId, treadmills.id), eq(walks.status, 'active')))
    .leftJoin(users, eq(users.id, walks.userId))
    .where(eq(treadmills.isActive, true))
    .orderBy(asc(treadmills.sortOrder), asc(treadmills.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    maxSpeedKmh: Number(row.maxSpeedKmh),
    sortOrder: Number(row.sortOrder),
    busy:
      row.walkId && row.startedAt && row.userId
        ? {
            walkId: row.walkId,
            user: { id: row.userId, name: row.userName ?? '', avatarId: row.userAvatarId ?? '' },
            startedAt: row.startedAt.toISOString(),
            speedKmh: Number(row.speedKmh ?? 0),
          }
        : null,
  }));
}
