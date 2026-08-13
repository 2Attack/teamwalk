import { TELEGRAM_ENABLED } from '@/lib/config';

/**
 * Низкоуровневый клиент Telegram Bot API (п. 6.10 ТЗ).
 *
 * Telegram никогда не в горячем пути (п. 6.10.1): любая ошибка здесь гасится
 * и превращается в `null`/`false` — ни один вызов не бросает исключений наружу.
 * Ошибка API — один повтор, затем запись в лог и отказ (п. 6.10.5):
 * уведомление не настолько важно, чтобы строить очередь.
 */

const API_TIMEOUT_MS = 10_000;

/** Подсистема включена: есть токен бота и рубильник не опущен (п. 6.10.7). */
export function telegramEnabled(): boolean {
  return TELEGRAM_ENABLED;
}

interface TelegramApiResponse {
  ok?: unknown;
  result?: unknown;
  description?: unknown;
}

/**
 * Один вызов метода Bot API. Возвращает `result` либо `null`.
 * Сетевые ошибки и 5xx ретраятся один раз; 4xx не ретраится — повтор бессмыслен.
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
      // Таймаут или сетевая ошибка — второй заход, если он ещё остался.
      console.error(`[telegram] ${method} network error, attempt ${attempt + 1}`, error);
    }
  }

  return null;
}

/** Имя бота меняется только вместе с токеном — безобидный мемо-кэш процесса. */
let cachedUsername: string | null = null;

/** `username` бота для deep link `https://t.me/<бот>?start=…` (п. 6.10.3). */
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
 * Отправка сообщения. `silent` — «тихий» режим без звука и вибрации
 * для второстепенных категорий (п. 6.10.1).
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

/** Ответ на нажатие inline-кнопки — короткий тост в клиенте Telegram. */
export async function answerCallbackQuery(id: string, text?: string): Promise<void> {
  const payload: Record<string, unknown> = { callback_query_id: id };
  if (text !== undefined) payload.text = text;
  await callApi('answerCallbackQuery', payload);
}

/** Перерисовка inline-клавиатуры под сообщением (тумблеры `/settings`). */
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
