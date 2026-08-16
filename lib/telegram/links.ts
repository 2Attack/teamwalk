import { randomBytes } from 'node:crypto';

import { and, eq, gt, isNull, not, or, sql } from 'drizzle-orm';

import { TELEGRAM_ENABLED, TG_LINK_TOKEN_TTL_MINUTES } from '@/lib/config';
import { db } from '@/lib/db';
import { telegramLinkTokens, telegramLinks, users } from '@/lib/db/schema';
import type { TelegramLink } from '@/lib/db/schema';
import type { TelegramStatusDto } from '@/lib/types';

/**
 * Telegram links and notification preferences.
 *
 * All concurrency is held by the DB: token one-shot use via atomic
 * `UPDATE … RETURNING`, "one chat — one user" via a unique index on `chat_id`.
 */

export async function getLink(userId: string): Promise<TelegramLink | null> {
  const rows = await db
    .select()
    .from(telegramLinks)
    .where(eq(telegramLinks.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLinkByChat(chatId: number): Promise<TelegramLink | null> {
  const rows = await db
    .select()
    .from(telegramLinks)
    .where(eq(telegramLinks.chatId, chatId))
    .limit(1);
  return rows[0] ?? null;
}

/** One-time deep-link token: 32 hex chars, 15-minute TTL. */
export async function createLinkToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + TG_LINK_TOKEN_TTL_MINUTES * 60_000);
  await db.insert(telegramLinkTokens).values({ token, userId, expiresAt });
  return { token, expiresAt };
}

/**
 * Atomic token consumption: `UPDATE … RETURNING` guarantees two parallel
 * `/start` with the same token link the chat at most once. `null` — token
 * unknown, expired, or already used.
 */
export async function consumeLinkToken(token: string): Promise<string | null> {
  const rows = await db
    .update(telegramLinkTokens)
    .set({ usedAt: sql`now()` })
    .where(
      and(
        eq(telegramLinkTokens.token, token),
        isNull(telegramLinkTokens.usedAt),
        gt(telegramLinkTokens.expiresAt, sql`now()`),
      ),
    )
    .returning({ userId: telegramLinkTokens.userId });
  return rows[0]?.userId ?? null;
}

/**
 * Link a chat to a user with relinking: old links are removed
 * both by `chat_id` (the chat belonged to another user) and by `user_id` (the
 * user was linked to another chat). `displacedChatId` — the foreign chat that
 * lost this user's card; the relink notification goes there.
 */
export async function upsertLink(
  userId: string,
  chatId: number,
): Promise<{ displacedChatId: number | null }> {
  const existing = await getLink(userId);

  await db
    .delete(telegramLinks)
    .where(or(eq(telegramLinks.chatId, chatId), eq(telegramLinks.userId, userId)));
  await db.insert(telegramLinks).values({ userId, chatId });

  const displacedChatId = existing !== null && existing.chatId !== chatId ? existing.chatId : null;
  return { displacedChatId };
}

/**
 * Unlinking restores the invite panel: "Don't show again" is
 * reset, otherwise a deliberately unlinked user could not relink from the panel.
 */
async function resetNudgeDismissed(userId: string): Promise<void> {
  await db.update(users).set({ tgNudgeDismissed: false }).where(eq(users.id, userId));
}

/** Full unlink from the app (`DELETE /api/users/:id/telegram`). */
export async function unlink(userId: string): Promise<boolean> {
  const rows = await db
    .delete(telegramLinks)
    .where(eq(telegramLinks.userId, userId))
    .returning({ userId: telegramLinks.userId });
  if (rows.length === 0) return false;
  await resetNudgeDismissed(rows[0].userId);
  return true;
}

/** Full unlink via the bot's `/stop` command. */
export async function unlinkByChat(chatId: number): Promise<boolean> {
  const rows = await db
    .delete(telegramLinks)
    .where(eq(telegramLinks.chatId, chatId))
    .returning({ userId: telegramLinks.userId });
  if (rows.length === 0) return false;
  await resetNudgeDismissed(rows[0].userId);
  return true;
}

/** "Don't show again" for the invite panel. */
export async function dismissNudge(userId: string): Promise<void> {
  await db.update(users).set({ tgNudgeDismissed: true }).where(eq(users.id, userId));
}

export type PrefKey =
  | 'notifyStart'
  | 'notifyFinish'
  | 'notifyRemind'
  | 'notifyDigest'
  | 'notifyFree'
  | 'attachHints';

/** Inversion in SQL, not read-then-write: two rapid clicks cannot lose each other. */
function prefUpdate(key: PrefKey) {
  switch (key) {
    case 'notifyStart':
      return { notifyStart: not(telegramLinks.notifyStart) };
    case 'notifyFinish':
      return { notifyFinish: not(telegramLinks.notifyFinish) };
    case 'notifyRemind':
      return { notifyRemind: not(telegramLinks.notifyRemind) };
    case 'notifyDigest':
      return { notifyDigest: not(telegramLinks.notifyDigest) };
    case 'notifyFree':
      return { notifyFree: not(telegramLinks.notifyFree) };
    case 'attachHints':
      return { attachHints: not(telegramLinks.attachHints) };
  }
}

/** Category toggle from `/settings`. `null` — chat not linked. */
export async function togglePref(chatId: number, key: PrefKey): Promise<TelegramLink | null> {
  const rows = await db
    .update(telegramLinks)
    .set(prefUpdate(key))
    .where(eq(telegramLinks.chatId, chatId))
    .returning();
  return rows[0] ?? null;
}

/** `/mute`: `null` unmutes, a future date mutes until then. */
export async function setMutedUntil(chatId: number, until: Date | null): Promise<void> {
  await db
    .update(telegramLinks)
    .set({ mutedUntil: until })
    .where(eq(telegramLinks.chatId, chatId));
}

/**
 * Status for the invite panel and linking modal: the panel is
 * shown until the user links or hits "Don't show again" — no counters or
 * cooldowns. `null` — user not found.
 */
export async function getTelegramStatus(userId: string): Promise<TelegramStatusDto | null> {
  const userRows = await db
    .select({ tgNudgeDismissed: users.tgNudgeDismissed })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!userRows[0]) return null;

  const link = await getLink(userId);
  return {
    enabled: TELEGRAM_ENABLED,
    linked: link !== null,
    dismissed: userRows[0].tgNudgeDismissed,
  };
}
