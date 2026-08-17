import { NextResponse, type NextRequest } from 'next/server';

import { ACCESS_COOKIE_NAME, isGateEnabled, verifyAccessToken } from '@/lib/access/pin';
import { m } from '@/lib/i18n';

import type { ApiErrorBody } from '@/lib/api';

/**
 * Deployment-wide PIN gate (spec 003, contracts §1). Pure cookie check —
 * no I/O, per the Next.js guidance for optimistic auth checks in proxy.
 * Cron and the Telegram webhook keep their own secrets and are excluded
 * by the matcher below, as are static assets and the unlock flow itself.
 */
export async function proxy(request: NextRequest) {
  if (!isGateEnabled()) return NextResponse.next();

  const pin = (process.env.ACCESS_PIN ?? '').trim();
  const cookieValue = request.cookies.get(ACCESS_COOKIE_NAME)?.value;
  if (await verifyAccessToken(cookieValue, pin)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith('/api/')) {
    const body: ApiErrorBody = { error: { code: 'PIN_REQUIRED', message: m.pin.required } };
    return NextResponse.json(body, { status: 401 });
  }

  const unlockUrl = new URL('/pin', request.url);
  unlockUrl.searchParams.set('next', pathname + search);
  return NextResponse.redirect(unlockUrl, 307);
}

export const config = {
  matcher: [
    /*
     * Everything except: Next internals and static assets, the PWA manifest
     * and icons, the unlock flow itself, and the machine endpoints (cron,
     * Telegram webhook) that carry their own dedicated secrets.
     */
    '/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|apple-icon\\.png|icon-192\\.png|icon-512\\.png|icon-maskable-512\\.png|manifest\\.webmanifest|pin$|api/pin$|api/cron/|api/telegram/).*)',
  ],
};
