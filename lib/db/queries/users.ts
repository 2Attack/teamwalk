import { asc, eq } from 'drizzle-orm';

import type { UserDto } from '@/lib/types';

import { db } from '../index';
import { users } from '../schema';

/** Participant queries (spec § 5.1). */

type UserRow = typeof users.$inferSelect;

const toDto = (row: UserRow): UserDto => ({
  id: row.id,
  name: row.name,
  avatarId: row.avatarId,
  hintsOptOut: row.hintsOptOut,
});

/**
 * Russian names are sorted in JS via `Intl.Collator`, not `ORDER BY ... COLLATE`:
 * the collation set of a given Postgres instance is not guaranteed, and with tens
 * of participants an in-memory sort is cheaper than risking a 500 on a missing collation.
 */
const byName = new Intl.Collator('ru', { sensitivity: 'base', numeric: true });

export async function listUsers(): Promise<UserDto[]> {
  const rows = await db.select().from(users).orderBy(asc(users.name));
  return rows.map(toDto).sort((a, b) => byName.compare(a.name, b.name));
}

export async function getUser(id: string): Promise<UserDto | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const row = rows[0];
  return row ? toDto(row) : null;
}

export async function createUser(input: {
  name: string;
  avatarId: string;
}): Promise<UserDto> {
  // No upfront name-conflict check: a SELECT-then-INSERT race is possible; the
  // source of truth is the users_name_uniq index, whose violation the caller handles.
  const rows = await db
    .insert(users)
    .values({ name: input.name, avatarId: input.avatarId })
    .returning();
  return toDto(rows[0]);
}

export async function updateUser(
  id: string,
  patch: { name?: string; avatarId?: string; hintsOptOut?: boolean },
): Promise<UserDto | null> {
  const values: Partial<Pick<UserRow, 'name' | 'avatarId' | 'hintsOptOut'>> = {};
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.avatarId !== undefined) values.avatarId = patch.avatarId;
  if (patch.hintsOptOut !== undefined) values.hintsOptOut = patch.hintsOptOut;

  // An empty SET is a SQL syntax error; Zod rejects such a patch, but be safe.
  if (Object.keys(values).length === 0) return getUser(id);

  const rows = await db.update(users).set(values).where(eq(users.id, id)).returning();
  const row = rows[0];
  return row ? toDto(row) : null;
}

/** Avatars already picked by someone: marked as taken in the UI (spec § 6.5). */
export async function takenAvatarIds(): Promise<string[]> {
  const rows = await db.selectDistinct({ avatarId: users.avatarId }).from(users);
  return rows.map((r) => r.avatarId);
}
