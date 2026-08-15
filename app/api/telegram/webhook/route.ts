import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { processTelegramUpdate } from '@/lib/telegram/webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The `X-Telegram-Bot-Api-Secret-Token` header must match `TELEGRAM_WEBHOOK_SECRET`
 * byte for byte (registered via `setWebhook` with `secret_token`, spec § 6.10.3).
 * A missing secret also denies: never expose the endpoint unprotected.
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return false;

  const header = request.headers.get('x-telegram-bot-api-secret-token');
  if (!header) return false;

  const expected = Buffer.from(secret);
  const received = Buffer.from(header);
  // timingSafeEqual requires equal-length buffers; different length is a definite mismatch.
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * POST /api/telegram/webhook — Telegram entry point (spec § 6.10.3).
 * The only endpoint facing the outside world, and the only one checking a
 * secret. Always answers a fast 200; idempotency comes from the `update_id`
 * journal inside the handler.
 */
export async function POST(request: Request) {
  // Telegram is not our client: no apiError envelope, only the status matters.
  if (!isAuthorized(request)) return new Response(null, { status: 401 });

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    // Retrying broken JSON is pointless — acknowledge with 200 and move on.
    return NextResponse.json({ ok: true });
  }

  // processTelegramUpdate never throws — errors are logged inside.
  await processTelegramUpdate(update);
  return NextResponse.json({ ok: true });
}
