import { NextResponse } from 'next/server';

import {
  ACCESS_COOKIE_MAX_AGE_S,
  ACCESS_COOKIE_NAME,
  computeAccessToken,
  constantTimeEqual,
  isGateEnabled,
} from '@/lib/access/pin';
import { apiError, handle, type ApiErrorBody } from '@/lib/api';
import { m } from '@/lib/i18n';
import { pinVerifySchema } from '@/lib/validation';

import type { PinVerifyResponseDto } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/pin — access-gate unlock (spec 003, contracts §2).
 * Malformed body, empty and wrong PIN all collapse into one generic
 * PIN_INVALID: responses must not hint at the PIN format.
 */
export async function POST(request: Request) {
  return handle<PinVerifyResponseDto | ApiErrorBody>(async () => {
    if (!isGateEnabled()) return apiError(404, 'NOT_FOUND', m.apiMessages.entryNotFound);

    let submitted = '';
    try {
      const parsed = pinVerifySchema.safeParse(await request.json());
      if (parsed.success) submitted = parsed.data.pin;
    } catch {
      // Malformed JSON — falls through to the generic rejection.
    }

    const pin = (process.env.ACCESS_PIN ?? '').trim();
    if (!submitted || !constantTimeEqual(submitted, pin)) {
      return apiError(401, 'PIN_INVALID', m.pin.wrongPin);
    }

    const response = NextResponse.json<PinVerifyResponseDto>({ ok: true });
    response.cookies.set(ACCESS_COOKIE_NAME, await computeAccessToken(pin), {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      maxAge: ACCESS_COOKIE_MAX_AGE_S,
      secure: process.env.NODE_ENV === 'production',
    });
    return response;
  });
}
