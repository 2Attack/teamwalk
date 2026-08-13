import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { runNotifySweep } from '@/lib/telegram/sweep';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Обход участников с запросами к Telegram-API может не уложиться в дефолтный лимит.
export const maxDuration = 60;

/**
 * Сравнение секрета за постоянное время — как у webhook (п. 6.10.3):
 * CRON_SECRET защищает публичный URL точно так же, как секрет Telegram.
 * Незаданный секрет — тоже отказ: эндпоинт без защиты не открываем.
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get('authorization');
  if (!header) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  // timingSafeEqual требует буферы одной длины; разная длина — заведомо не совпало.
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * GET /api/cron/notify — вход для Vercel Cron (п. 6.10.5): напоминания «пора
 * размяться» и по понедельникам недельный дайджест. Дедупликация по журналу
 * `notification_log` гарантирует, что cron и ленивый фолбэк не отправят дважды.
 */
export async function GET(request: Request) {
  // Vercel Cron — не наш клиент: без конверта apiError, важен только статус.
  if (!isAuthorized(request)) return new Response(null, { status: 401 });

  await runNotifySweep();
  return NextResponse.json({ ok: true });
}
