import { randomBytes } from 'node:crypto';

import { and, eq, gt, isNull, not, or, sql } from 'drizzle-orm';

import {
  TELEGRAM_ENABLED,
  TG_LINK_TOKEN_TTL_MINUTES,
  TG_NUDGE_COOLDOWN_DAYS,
  TG_NUDGE_MAX_SHOWS,
} from '@/lib/config';
import { db } from '@/lib/db';
import { telegramLinkTokens, telegramLinks, users } from '@/lib/db/schema';
import type { TelegramLink } from '@/lib/db/schema';
import type { TelegramStatusDto } from '@/lib/types';

/**
 * Привязки Telegram и настройки уведомлений (п. 6.10.3, 6.10.6 ТЗ).
 *
 * Вся конкурентность держится БД: одноразовость токена — атомарным
 * `UPDATE … RETURNING`, «один чат — один участник» — unique на `chat_id`.
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

/** Одноразовый токен deep link'а: 32 hex-символа, TTL 15 минут (п. 6.10.3). */
export async function createLinkToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + TG_LINK_TOKEN_TTL_MINUTES * 60_000);
  await db.insert(telegramLinkTokens).values({ token, userId, expiresAt });
  return { token, expiresAt };
}

/**
 * Атомарное погашение токена: `UPDATE … RETURNING` гарантирует, что два
 * параллельных `/start` с одним токеном привяжут чат не более одного раза.
 * `null` — токен неизвестен, просрочен или уже использован.
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
 * Привязка чата к участнику с перепривязкой (п. 6.10.3): сносятся старые связи
 * и по `chat_id` (чат уходил другому участнику), и по `user_id` (участник был
 * привязан к другому чату). `displacedChatId` — чужой чат, потерявший карточку
 * этого участника: туда уходит уведомление о перепривязке.
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
 * Отвязка возвращает приглашение (п. 6.10.2): счётчики панели сбрасываются,
 * иначе кулдаун от прошлых показов прятал бы её и после осознанного `/stop`,
 * а постоянной кнопки привязки в интерфейсе пока нет.
 */
async function resetNudgeCounters(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ tgNudgeCount: 0, tgNudgeLastAt: null, tgNudgeDismissed: false })
    .where(eq(users.id, userId));
}

/** Полная отвязка из приложения (`DELETE /api/users/:id/telegram`). */
export async function unlink(userId: string): Promise<boolean> {
  const rows = await db
    .delete(telegramLinks)
    .where(eq(telegramLinks.userId, userId))
    .returning({ userId: telegramLinks.userId });
  if (rows.length === 0) return false;
  await resetNudgeCounters(rows[0].userId);
  return true;
}

/** Полная отвязка командой `/stop` из бота. */
export async function unlinkByChat(chatId: number): Promise<boolean> {
  const rows = await db
    .delete(telegramLinks)
    .where(eq(telegramLinks.chatId, chatId))
    .returning({ userId: telegramLinks.userId });
  if (rows.length === 0) return false;
  await resetNudgeCounters(rows[0].userId);
  return true;
}

export type PrefKey =
  | 'notifyStart'
  | 'notifyFinish'
  | 'notifyRemind'
  | 'notifyDigest'
  | 'notifyFree'
  | 'attachHints';

/** Инверсия в SQL, а не чтение-запись: два клика подряд не потеряют друг друга. */
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

/** Тумблер категории из `/settings`. `null` — чат не привязан. */
export async function togglePref(chatId: number, key: PrefKey): Promise<TelegramLink | null> {
  const rows = await db
    .update(telegramLinks)
    .set(prefUpdate(key))
    .where(eq(telegramLinks.chatId, chatId))
    .returning();
  return rows[0] ?? null;
}

/** `/mute`: `null` снимает заглушку, дата в будущем — глушит до неё (п. 6.10.3). */
export async function setMutedUntil(chatId: number, until: Date | null): Promise<void> {
  await db
    .update(telegramLinks)
    .set({ mutedUntil: until })
    .where(eq(telegramLinks.chatId, chatId));
}

/**
 * Счётчики панели-приглашения (п. 6.10.2) — в БД на участнике, не в localStorage:
 * отказ должен действовать с любого устройства.
 */
export async function recordNudge(userId: string, action: 'shown' | 'dismissed'): Promise<void> {
  if (action === 'shown') {
    await db
      .update(users)
      .set({ tgNudgeCount: sql`${users.tgNudgeCount} + 1`, tgNudgeLastAt: sql`now()` })
      .where(eq(users.id, userId));
    return;
  }
  await db.update(users).set({ tgNudgeDismissed: true }).where(eq(users.id, userId));
}

/**
 * Статус для карточки и панели-приглашения. `nudgeEligible` — правила п. 6.10.2:
 * не привязан, подсистема включена, не отказался, лимит показов не выбран,
 * с последнего показа прошло не меньше кулдауна.
 */
export async function getTelegramStatus(userId: string): Promise<TelegramStatusDto | null> {
  const userRows = await db
    .select({
      tgNudgeCount: users.tgNudgeCount,
      tgNudgeLastAt: users.tgNudgeLastAt,
      tgNudgeDismissed: users.tgNudgeDismissed,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = userRows[0];
  if (!user) return null;

  const link = await getLink(userId);
  const linked = link !== null;

  const cooldownMs = TG_NUDGE_COOLDOWN_DAYS * 86_400_000;
  const cooledDown =
    user.tgNudgeLastAt === null || Date.now() - user.tgNudgeLastAt.getTime() >= cooldownMs;

  const nudgeEligible =
    TELEGRAM_ENABLED &&
    !linked &&
    !user.tgNudgeDismissed &&
    user.tgNudgeCount < TG_NUDGE_MAX_SHOWS &&
    cooledDown;

  return { enabled: TELEGRAM_ENABLED, linked, nudgeEligible };
}
