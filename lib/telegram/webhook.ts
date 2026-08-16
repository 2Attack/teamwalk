import { and, eq, sql } from 'drizzle-orm';

import { APP_NAME } from '@/lib/config';
import { db } from '@/lib/db';
import { achievements, telegramUpdates, treadmills, users, walks } from '@/lib/db/schema';
import type { TelegramLink } from '@/lib/db/schema';

import { answerCallbackQuery, editMessageReplyMarkup, sendMessage } from './client';
import { consumeLinkToken, getLinkByChat, setMutedUntil, togglePref, unlinkByChat, upsertLink } from './links';
import type { PrefKey } from './links';
import { notifyTreadmillFreed, wereAllTreadmillsBusy } from './notify';
import { m } from '@/lib/i18n';

import {
  achievementUnlockedText,
  farewellText,
  helpText,
  relinkedText,
  staleTokenText,
  uiText,
  welcomeText,
} from './texts';

/**
 * Processing of one Telegram update. Never throws: the
 * webhook must answer 200 fast, and Telegram retries undelivered updates —
 * idempotency is held by the unique index on `update_id`.
 *
 * The bot can do almost nothing: the only mutation is
 * cancelling one's own active walk; the rest is notification settings.
 */

/** Narrow subset of a Telegram Update — only what we actually read. */
interface TgMessage {
  message_id?: unknown;
  chat?: { id?: unknown };
  text?: unknown;
}

interface TgUpdate {
  update_id?: unknown;
  message?: TgMessage;
  callback_query?: { id?: unknown; data?: unknown; message?: TgMessage };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Hint for unlinked chats — the token comes from the app, not the bot. */
const NOT_LINKED_TEXT = uiText.notLinked(APP_NAME);

/** Category toggles for `/settings`: ✅ — on, ⬜ — off. */
function settingsKeyboard(link: TelegramLink): unknown {
  const row = (on: boolean, label: string, data: string) => [
    { text: `${on ? '✅' : '⬜'} ${label}`, callback_data: data },
  ];
  const labels = uiText.settingsLabels;
  return {
    inline_keyboard: [
      row(link.notifyStart, labels.start, 'pref:start'),
      row(link.notifyFinish, labels.finish, 'pref:finish'),
      row(link.notifyRemind, labels.remind, 'pref:remind'),
      row(link.notifyFree, labels.free, 'pref:free'),
      row(link.notifyDigest, labels.digest, 'pref:digest'),
      row(link.attachHints, labels.hints, 'pref:hints'),
    ],
  };
}

const PREF_KEYS: Record<string, PrefKey> = {
  start: 'notifyStart',
  finish: 'notifyFinish',
  remind: 'notifyRemind',
  free: 'notifyFree',
  digest: 'notifyDigest',
  hints: 'attachHints',
};

/** `/start <token>`: consume the token, link the chat, notify the displaced one. */
async function handleStart(chatId: number, token: string | null): Promise<void> {
  const userId = token !== null ? await consumeLinkToken(token) : null;
  if (userId === null) {
    await sendMessage(chatId, staleTokenText());
    return;
  }

  const { displacedChatId } = await upsertLink(userId, chatId);

  const userRows = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const name = userRows[0]?.name ?? uiText.fallbackUserName;

  // The displaced chat learns about the relink — this is the trust-model
  // safeguard: the real owner always sees they were relinked.
  if (displacedChatId !== null) {
    await sendMessage(displacedChatId, relinkedText(name));
  }
  await sendMessage(chatId, welcomeText(name));

  // "Connected" — the only achievement granted outside the
  // finish transaction: awarded here, congratulation goes to the fresh chat.
  const unlocked = await db
    .insert(achievements)
    .values({ userId, code: 'connected' })
    .onConflictDoNothing()
    .returning({ code: achievements.code });
  if (unlocked.length > 0) {
    await sendMessage(chatId, achievementUnlockedText(m.achievements.connected.title));
  }
}

async function handleMessage(chatId: number, text: string): Promise<void> {
  const startMatch = text.match(/^\/start(?:\s+(\S+))?/);
  if (startMatch) {
    await handleStart(chatId, startMatch[1] ?? null);
    return;
  }

  if (text.startsWith('/settings')) {
    const link = await getLinkByChat(chatId);
    if (!link) {
      await sendMessage(chatId, NOT_LINKED_TEXT);
      return;
    }
    await sendMessage(chatId, uiText.settingsPrompt, {
      replyMarkup: settingsKeyboard(link),
    });
    return;
  }

  if (text.startsWith('/mute')) {
    const link = await getLinkByChat(chatId);
    if (!link) {
      await sendMessage(chatId, NOT_LINKED_TEXT);
      return;
    }
    await sendMessage(chatId, uiText.mutePrompt, {
      replyMarkup: {
        inline_keyboard: [
          [
            { text: uiText.muteDay, callback_data: 'mute:day' },
            { text: uiText.muteWeek, callback_data: 'mute:week' },
            { text: uiText.muteForever, callback_data: 'mute:forever' },
          ],
        ],
      },
    });
    return;
  }

  if (text.startsWith('/stop')) {
    const removed = await unlinkByChat(chatId);
    await sendMessage(chatId, removed ? farewellText() : NOT_LINKED_TEXT);
    return;
  }

  const link = await getLinkByChat(chatId);
  await sendMessage(chatId, link ? helpText() : NOT_LINKED_TEXT);
}

/** "It's not me": cancel one's own active walk — SQL modeled on `lib/walks/autoclose.ts`. */
async function handleCancel(cbId: string, walkId: string, link: TelegramLink): Promise<void> {
  if (!UUID_RE.test(walkId)) {
    await answerCallbackQuery(cbId, uiText.walkNotActiveToast);
    return;
  }

  // Before the cancel: this path frees the treadmill just like POST /cancel.
  const wasFullHouse = await wereAllTreadmillsBusy();

  const cancelled = await db
    .update(walks)
    .set({
      status: 'cancelled',
      endedAt: sql`now()`,
      durationSec: sql`greatest(0, extract(epoch from (now() - ${walks.startedAt}))::int)`,
    })
    .where(and(eq(walks.id, walkId), eq(walks.status, 'active'), eq(walks.userId, link.userId)))
    .returning({ id: walks.id, treadmillId: walks.treadmillId, durationSec: walks.durationSec });

  await answerCallbackQuery(
    cbId,
    cancelled.length > 0 ? uiText.walkCancelledToast : uiText.walkNotActiveToast,
  );

  if (cancelled.length > 0 && wasFullHouse) {
    const rows = await db
      .select({ name: treadmills.name })
      .from(treadmills)
      .where(eq(treadmills.id, cancelled[0].treadmillId))
      .limit(1);
    await notifyTreadmillFreed({
      walkId: cancelled[0].id,
      treadmillName: rows[0]?.name ?? uiText.fallbackTreadmillName,
      freedByUserId: link.userId,
      busySec: cancelled[0].durationSec ?? 0,
    });
  }
}

async function handleCallback(cbId: string, data: string, message: TgMessage | undefined): Promise<void> {
  const chatId = typeof message?.chat?.id === 'number' ? message.chat.id : null;
  if (chatId === null) {
    await answerCallbackQuery(cbId);
    return;
  }

  const link = await getLinkByChat(chatId);
  if (!link) {
    await answerCallbackQuery(cbId, uiText.chatNotLinkedToast);
    return;
  }

  if (data.startsWith('cancel:')) {
    await handleCancel(cbId, data.slice('cancel:'.length), link);
    return;
  }

  if (data.startsWith('pref:')) {
    const key = PREF_KEYS[data.slice('pref:'.length)];
    if (key === undefined) {
      await answerCallbackQuery(cbId);
      return;
    }
    const updated = await togglePref(chatId, key);
    const messageId = typeof message?.message_id === 'number' ? message.message_id : null;
    if (updated !== null && messageId !== null) {
      await editMessageReplyMarkup(chatId, messageId, settingsKeyboard(updated));
    }
    await answerCallbackQuery(cbId);
    return;
  }

  if (data.startsWith('mute:')) {
    const period = data.slice('mute:'.length);
    const until =
      period === 'day'
        ? new Date(Date.now() + 86_400_000)
        : period === 'week'
          ? new Date(Date.now() + 7 * 86_400_000)
          : new Date('9999-01-01');
    await setMutedUntil(chatId, until);
    await answerCallbackQuery(cbId, uiText.mutedToast);
    return;
  }

  await answerCallbackQuery(cbId);
}

export async function processTelegramUpdate(update: unknown): Promise<void> {
  try {
    if (update === null || typeof update !== 'object') return;
    const u = update as TgUpdate;

    // Updates without update_id are ignored: nothing to dedup by.
    if (typeof u.update_id !== 'number') return;

    // Telegram retries undelivered updates — an empty returning means this
    // update_id was already processed (by this or another instance).
    const inserted = await db
      .insert(telegramUpdates)
      .values({ updateId: u.update_id })
      .onConflictDoNothing()
      .returning({ updateId: telegramUpdates.updateId });
    if (inserted.length === 0) return;

    const cb = u.callback_query;
    if (cb !== undefined && typeof cb.id === 'string' && typeof cb.data === 'string') {
      await handleCallback(cb.id, cb.data, cb.message);
      return;
    }

    const message = u.message;
    if (
      message !== undefined &&
      typeof message.chat?.id === 'number' &&
      typeof message.text === 'string'
    ) {
      await handleMessage(message.chat.id, message.text.trim());
    }
  } catch (error) {
    console.error('[telegram] webhook update processing failed', error);
  }
}
