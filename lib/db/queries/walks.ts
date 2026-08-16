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
 * WALKS-zone queries. None of them assume a single active walk system-wide:
 * there are exactly as many active walks as busy treadmills.
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
 * Speed changes for the given walks. The starting segment is not
 * stored — it is assembled from `walks`, so a walk with no changes yields no
 * rows here and old records work without a backfill.
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
  // First segment is the starting speed; changes follow in time order.
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
    // Expose the current speed, not the starting one: it's what the screen shows.
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

/** Deletion window: 15 minutes from `ended_at`. */
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
    // numeric arrives as a string — coerce before returning to the client.
    distanceKm: row.distanceKm === null ? null : Number(row.distanceKm),
    speedKmh: Number(row.speedKmh),
    status: row.status,
    canDelete: canDeleteWalk(row.endedAt),
  };
}

/** Participant's active walk (at most one). */
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

/** Active walk by id — for the walk screen and speed changes. */
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

/** All active walks: one per busy treadmill. */
export async function listActiveWalks(): Promise<ActiveWalkDto[]> {
  const rows = await db
    .select(activeColumns)
    .from(walks)
    .innerJoin(treadmills, eq(treadmills.id, walks.treadmillId))
    .innerJoin(users, eq(users.id, walks.userId))
    .where(eq(walks.status, 'active'))
    .orderBy(asc(walks.startedAt));

  // One query for all walks at once, not N+1 per walk.
  const changes = await loadSpeedChanges(rows.map((row) => row.id));
  return rows.map((row) => toActiveWalk(row, changes.get(row.id)));
}

/** Participant history — newest first. */
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

/** Treadmill by id — with `isActive`, to tell "missing" from "disabled". */
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
 * Active treadmills with current occupancy, fetched in one query
 * (left join on the active walk), not N+1 subqueries.
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
      // Current speed: the latest change, else the starting speed. A correlated
      // subquery instead of another join: one row per treadmill.
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
