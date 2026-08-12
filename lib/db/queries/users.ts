import { asc, eq } from 'drizzle-orm';

import type { UserDto } from '@/lib/types';

import { db } from '../index';
import { users } from '../schema';

/** Запросы по участникам (п. 5.1 ТЗ). */

type UserRow = typeof users.$inferSelect;

const toDto = (row: UserRow): UserDto => ({
  id: row.id,
  name: row.name,
  avatarId: row.avatarId,
  hintsOptOut: row.hintsOptOut,
});

/**
 * Сортировка русских имён делается в JS через `Intl.Collator`, а не `ORDER BY ... COLLATE`:
 * набор коллаций в конкретном инстансе Postgres не гарантирован, а участников десятки —
 * сортировка в памяти дешевле, чем риск 500-й на отсутствующей коллации.
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
  // Конфликт имени не проверяем заранее: между SELECT и INSERT возможна гонка,
  // источник истины — уникальный индекс users_name_uniq, его нарушение ловит вызывающий код.
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

  // Пустой SET — синтаксическая ошибка в SQL; такой patch отсекает Zod, но подстрахуемся.
  if (Object.keys(values).length === 0) return getUser(id);

  const rows = await db.update(users).set(values).where(eq(users.id, id)).returning();
  const row = rows[0];
  return row ? toDto(row) : null;
}

/** Аватары, уже выбранные кем-то: в UI помечаются как «занят» (п. 6.5). */
export async function takenAvatarIds(): Promise<string[]> {
  const rows = await db.selectDistinct({ avatarId: users.avatarId }).from(users);
  return rows.map((r) => r.avatarId);
}
