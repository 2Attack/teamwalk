import { and, asc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { treadmills, users, walks } from '@/lib/db/schema';
import type { TreadmillAdminDto } from '@/lib/types';

/**
 * SETTINGS-zone queries: treadmill CRUD for the settings screen.
 * The start flow keeps using `listActiveTreadmills` from `walks.ts` — that list
 * is filtered to active treadmills and shaped for the picker, not for admin.
 */

const adminColumns = {
  id: treadmills.id,
  name: treadmills.name,
  maxSpeedKmh: treadmills.maxSpeedKmh,
  sortOrder: treadmills.sortOrder,
  isActive: treadmills.isActive,
  /**
   * Walks of any status referencing the treadmill: > 0 forbids deletion.
   * A correlated subquery — one row per treadmill, and the
   * count join would otherwise fight the busy-walk left join.
   */
  walksCount: sql<number>`(
    select count(*)::int from walks w where w.treadmill_id = ${treadmills.id}
  )`,
  walkId: walks.id,
  walkStartedAt: walks.startedAt,
  walkSpeedKmh: walks.speedKmh,
  userId: users.id,
  userName: users.name,
  userAvatarId: users.avatarId,
};

/** All treadmills, inactive included, sorted like the start picker. */
export async function listAllTreadmills(): Promise<TreadmillAdminDto[]> {
  const rows = await db
    .select(adminColumns)
    .from(treadmills)
    .leftJoin(walks, and(eq(walks.treadmillId, treadmills.id), eq(walks.status, 'active')))
    .leftJoin(users, eq(users.id, walks.userId))
    .orderBy(asc(treadmills.sortOrder), asc(treadmills.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    maxSpeedKmh: Number(row.maxSpeedKmh),
    sortOrder: Number(row.sortOrder),
    isActive: row.isActive,
    walksCount: Number(row.walksCount),
    busy:
      row.walkId && row.walkStartedAt && row.userId
        ? {
            walkId: row.walkId,
            user: { id: row.userId, name: row.userName ?? '', avatarId: row.userAvatarId ?? '' },
            startedAt: row.walkStartedAt.toISOString(),
            // The settings list does not show speed; the start speed is enough
            // to satisfy the shared TreadmillBusyDto shape.
            speedKmh: Number(row.walkSpeedKmh ?? 0),
          }
        : null,
  }));
}

/** Admin row of a single treadmill — reread after a mutation. */
export async function getTreadmillAdmin(id: string): Promise<TreadmillAdminDto | null> {
  const all = await listAllTreadmills();
  return all.find((t) => t.id === id) ?? null;
}

export async function createTreadmill(input: {
  name: string;
  maxSpeedKmh: number;
  sortOrder?: number;
}): Promise<TreadmillAdminDto> {
  // No pre-check for the name: the `treadmills_name_uniq` index is the source
  // of truth, its violation is caught by the caller (races between SELECT and
  // INSERT are real, same as with users).
  const rows = await db
    .insert(treadmills)
    .values({
      name: input.name,
      maxSpeedKmh: input.maxSpeedKmh,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning({ id: treadmills.id });

  // A freshly created treadmill has no walks and cannot be busy.
  const created = await getTreadmillAdmin(rows[0].id);
  if (!created) throw new Error('Treadmill vanished right after insert');
  return created;
}

export async function updateTreadmill(
  id: string,
  patch: { name?: string; maxSpeedKmh?: number; sortOrder?: number; isActive?: boolean },
): Promise<TreadmillAdminDto | null> {
  const values: Partial<typeof treadmills.$inferInsert> = {};
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.maxSpeedKmh !== undefined) values.maxSpeedKmh = patch.maxSpeedKmh;
  if (patch.sortOrder !== undefined) values.sortOrder = patch.sortOrder;
  if (patch.isActive !== undefined) values.isActive = patch.isActive;

  // An empty SET is a SQL syntax error; Zod rejects such a patch, but be safe.
  if (Object.keys(values).length === 0) return getTreadmillAdmin(id);

  const rows = await db
    .update(treadmills)
    .set(values)
    .where(eq(treadmills.id, id))
    .returning({ id: treadmills.id });
  if (!rows[0]) return null;
  return getTreadmillAdmin(id);
}

/**
 * Deletes a treadmill. Walks referencing it make the FK (`on delete restrict`)
 * throw SQLSTATE 23503 — the route translates it into 409 TREADMILL_HAS_WALKS.
 * Returns false when the treadmill does not exist.
 */
export async function deleteTreadmill(id: string): Promise<boolean> {
  const rows = await db
    .delete(treadmills)
    .where(eq(treadmills.id, id))
    .returning({ id: treadmills.id });
  return rows.length > 0;
}
