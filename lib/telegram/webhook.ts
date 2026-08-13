import { and, eq, sql } from 'drizzle-orm';

import { APP_NAME } from '@/lib/config';
import { db } from '@/lib/db';
import { telegramUpdates, treadmills, users, walks } from '@/lib/db/schema';
import type { TelegramLink } from '@/lib/db/schema';

import { answerCallbackQuery, editMessageReplyMarkup, sendMessage } from './client';
import { consumeLinkToken, getLinkByChat, setMutedUntil, togglePref, unlinkByChat, upsertLink } from './links';
import type { PrefKey } from './links';
import { notifyTreadmillFreed, wereAllTreadmillsBusy } from './notify';
import { farewellText, helpText, relinkedText, staleTokenText, welcomeText } from './texts';

/**
 * Обработка одного апдейта Telegram (п. 6.10.3 ТЗ). Никогда не бросает:
 * webhook обязан быстро ответить 200, а Telegram ретраит недоставленное —
 * идемпотентность держит unique-индекс на `update_id`.
 *
 * Бот почти ничего не может (п. 6.10.1): единственная мутация — отменить
 * свою активную прогулку; всё остальное — настройки уведомлений.
 */

/** Узкое подмножество Telegram Update — только то, что реально читаем. */
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

/** Подсказка для чатов без привязки — токен берут в приложении, не у бота. */
const NOT_LINKED_TEXT = `Этот чат не привязан к ${APP_NAME}. Возьми ссылку привязки в приложении — она живёт в карточке участника.`;

/** Тумблеры категорий для `/settings`: ✅ — включено, ⬜ — выключено. */
function settingsKeyboard(link: TelegramLink): unknown {
  const row = (on: boolean, label: string, data: string) => [
    { text: `${on ? '✅' : '⬜'} ${label}`, callback_data: data },
  ];
  return {
    inline_keyboard: [
      row(link.notifyStart, 'Старт прогулки', 'pref:start'),
      row(link.notifyFinish, 'Финиш прогулки', 'pref:finish'),
      row(link.notifyRemind, 'Напоминания', 'pref:remind'),
      row(link.notifyFree, 'Дорожка освободилась', 'pref:free'),
      row(link.notifyDigest, 'Недельный дайджест', 'pref:digest'),
      row(link.attachHints, 'Хинты в сообщениях', 'pref:hints'),
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

/** `/start <токен>`: погасить токен, привязать чат, уведомить вытесненный. */
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
  const name = userRows[0]?.name ?? 'участник';

  // Чат, потерявший карточку, узнаёт о перепривязке — это и есть защита
  // модели доверия: настоящий владелец всегда видит, что его перепривязали.
  if (displacedChatId !== null) {
    await sendMessage(displacedChatId, relinkedText(name));
  }
  await sendMessage(chatId, welcomeText(name));
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
    await sendMessage(chatId, '⚙️ Настройки уведомлений — жми, чтобы переключить:', {
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
    await sendMessage(chatId, 'Насколько заглушить уведомления?', {
      replyMarkup: {
        inline_keyboard: [
          [
            { text: 'День', callback_data: 'mute:day' },
            { text: 'Неделя', callback_data: 'mute:week' },
            { text: 'Навсегда', callback_data: 'mute:forever' },
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

/** «Это не я»: отмена своей активной прогулки — образец SQL в `lib/walks/autoclose.ts`. */
async function handleCancel(cbId: string, walkId: string, link: TelegramLink): Promise<void> {
  if (!UUID_RE.test(walkId)) {
    await answerCallbackQuery(cbId, 'Прогулка уже не активна');
    return;
  }

  // До отмены: этот путь освобождает дорожку так же, как POST /cancel (п. 6.10.4).
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

  await answerCallbackQuery(cbId, cancelled.length > 0 ? 'Прогулка отменена' : 'Прогулка уже не активна');

  if (cancelled.length > 0 && wasFullHouse) {
    const rows = await db
      .select({ name: treadmills.name })
      .from(treadmills)
      .where(eq(treadmills.id, cancelled[0].treadmillId))
      .limit(1);
    await notifyTreadmillFreed({
      walkId: cancelled[0].id,
      treadmillName: rows[0]?.name ?? 'Дорожка',
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
    await answerCallbackQuery(cbId, 'Чат не привязан');
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
    await answerCallbackQuery(cbId, 'Заглушил');
    return;
  }

  await answerCallbackQuery(cbId);
}

export async function processTelegramUpdate(update: unknown): Promise<void> {
  try {
    if (update === null || typeof update !== 'object') return;
    const u = update as TgUpdate;

    // Апдейты без update_id игнорируем: без него нечем дедуплицировать.
    if (typeof u.update_id !== 'number') return;

    // Telegram ретраит недоставленные апдейты — пустой returning значит,
    // что этот update_id уже обработан (тем же или другим инстансом).
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
