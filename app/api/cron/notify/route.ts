import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { runNotifySweep } from '@/lib/telegram/sweep';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Sweeping members with Telegram API calls may exceed the default limit.
export const maxDuration = 60;

/**
 * Constant-time secret comparison, same as the webhook.
 * A missing CRON_SECRET also denies: never expose the endpoint unprotected.
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get('authorization');
  if (!header) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  // timingSafeEqual requires equal-length buffers; different length is a definite mismatch.
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * GET /api/cron/notify — Vercel Cron entry: stretch reminders
 * and the Monday weekly digest. Dedup via `notification_log` ensures the cron
 * and the lazy fallback never send twice.
 */
export async function GET(request: Request) {
  // Vercel Cron is not our client: no apiError envelope, only the status matters.
  if (!isAuthorized(request)) return new Response(null, { status: 401 });

  await runNotifySweep();
  return NextResponse.json({ ok: true });
}
