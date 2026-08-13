import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { processTelegramUpdate } from '@/lib/telegram/webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Заголовок `X-Telegram-Bot-Api-Secret-Token` должен побайтово совпадать
 * с `TELEGRAM_WEBHOOK_SECRET` (регистрируется через `setWebhook` с `secret_token`,
 * п. 6.10.3). Незаданный секрет — тоже отказ: эндпоинт без защиты не открываем.
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return false;

  const header = request.headers.get('x-telegram-bot-api-secret-token');
  if (!header) return false;

  const expected = Buffer.from(secret);
  const received = Buffer.from(header);
  // timingSafeEqual требует буферы одной длины; разная длина — заведомо не совпало.
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * POST /api/telegram/webhook — вход для Telegram (п. 6.10.3).
 * Единственный эндпоинт продукта, который слушает внешний мир, — и единственный
 * с проверкой секрета. Ответ всегда быстрый 200: тяжёлой работы здесь нет
 * по построению, идемпотентность — журналом `update_id` внутри обработчика.
 */
export async function POST(request: Request) {
  // Telegram — не наш клиент: конверт apiError не нужен, он смотрит только на статус.
  if (!isAuthorized(request)) return new Response(null, { status: 401 });

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    // Битый JSON ретраить бессмысленно — подтверждаем 200 и забываем.
    return NextResponse.json({ ok: true });
  }

  // processTelegramUpdate никогда не бросает — ошибки логируются внутри.
  await processTelegramUpdate(update);
  return NextResponse.json({ ok: true });
}
