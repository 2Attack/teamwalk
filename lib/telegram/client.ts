import { TELEGRAM_ENABLED } from '@/lib/config';

/**
 * Low-level Telegram Bot API client (spec § 6.10).
 *
 * Telegram is never in the hot path (spec § 6.10.1): every error here is
 * swallowed into `null`/`false` — no call throws. An API error gets one
 * retry, then a log entry and give-up (spec § 6.10.5): a notification is not
 * important enough to build a queue for.
 */

const API_TIMEOUT_MS = 10_000;

/** Subsystem is on: bot token present and the kill switch not thrown (spec § 6.10.7). */
export function telegramEnabled(): boolean {
  return TELEGRAM_ENABLED;
}

interface TelegramApiResponse {
  ok?: unknown;
  result?: unknown;
  description?: unknown;
}

/**
 * One Bot API method call. Returns `result` or `null`. Network errors and
 * 5xx retry once; 4xx does not — a repeat is pointless.
 */
async function callApi(method: string, payload: Record<string, unknown>): Promise<unknown | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!TELEGRAM_ENABLED || !token) return null;

  const url = `https://api.telegram.org/bot${token}/${method}`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });

      if (res.status >= 500) {
        console.error(`[telegram] ${method}: HTTP ${res.status}, attempt ${attempt + 1}`);
        continue;
      }

      const data = (await res.json()) as TelegramApiResponse;
      if (data.ok !== true) {
        console.error(`[telegram] ${method} rejected`, data.description ?? `HTTP ${res.status}`);
        return null;
      }
      return data.result ?? null;
    } catch (error) {
      // Timeout or network error — take the second attempt if one is left.
      console.error(`[telegram] ${method} network error, attempt ${attempt + 1}`, error);
    }
  }

  return null;
}

/** The bot username only changes with the token — a harmless per-process memo. */
let cachedUsername: string | null = null;

/** Bot `username` for the deep link `https://t.me/<bot>?start=…` (spec § 6.10.3). */
export async function getBotUsername(): Promise<string | null> {
  if (cachedUsername !== null) return cachedUsername;

  const result = await callApi('getMe', {});
  if (
    result !== null &&
    typeof result === 'object' &&
    'username' in result &&
    typeof (result as { username: unknown }).username === 'string'
  ) {
    cachedUsername = (result as { username: string }).username;
  }
  return cachedUsername;
}

/**
 * Send a message. `silent` — no sound or vibration, for secondary categories
 * (spec § 6.10.1).
 */
export async function sendMessage(
  chatId: number,
  text: string,
  opts?: { silent?: boolean; replyMarkup?: unknown },
): Promise<boolean> {
  const payload: Record<string, unknown> = { chat_id: chatId, text };
  if (opts?.silent) payload.disable_notification = true;
  if (opts?.replyMarkup !== undefined) payload.reply_markup = opts.replyMarkup;
  return (await callApi('sendMessage', payload)) !== null;
}

/** Reply to an inline button press — a short toast in the Telegram client. */
export async function answerCallbackQuery(id: string, text?: string): Promise<void> {
  const payload: Record<string, unknown> = { callback_query_id: id };
  if (text !== undefined) payload.text = text;
  await callApi('answerCallbackQuery', payload);
}

/** Redraw the inline keyboard under a message (`/settings` toggles). */
export async function editMessageReplyMarkup(
  chatId: number,
  messageId: number,
  replyMarkup: unknown,
): Promise<void> {
  await callApi('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup,
  });
}
