import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { m } from './i18n';

/** Unified API error format (spec § 5). */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'NAME_TAKEN'
  | 'WALK_ALREADY_ACTIVE'
  | 'TREADMILL_BUSY'
  | 'TREADMILL_INACTIVE'
  | 'TREADMILL_HAS_WALKS'
  | 'NO_TREADMILLS'
  | 'LLM_DISABLED'
  | 'SPEED_OUT_OF_RANGE'
  | 'WALK_NOT_ACTIVE'
  | 'DELETE_WINDOW_EXPIRED'
  | 'TELEGRAM_DISABLED'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    field?: string;
    details?: unknown;
  };
}

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  extra?: { field?: string; details?: unknown },
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: { code, message, ...extra } },
    { status },
  );
}

export function validationError(error: ZodError): NextResponse<ApiErrorBody> {
  const first = error.issues[0];
  return apiError(400, 'VALIDATION_ERROR', first?.message ?? m.api.invalidData, {
    field: first?.path.join('.') || undefined,
    details: error.issues,
  });
}

/** Handler wrapper: catches Zod and unexpected errors, logs, returns the envelope. */
export async function handle<T>(fn: () => Promise<NextResponse<T>>) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ZodError) return validationError(error);
    console.error('[api] unhandled error', error);
    return apiError(500, 'INTERNAL_ERROR', m.api.internalError);
  }
}

/**
 * Postgres unique-constraint violation.
 *
 * Drizzle wraps the driver error into a `DrizzleQueryError` that has no `code`,
 * so the whole `cause` chain must be checked — otherwise a race on a partial
 * unique index reaches the client as a 500 instead of a clear 409.
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  return isPgViolation(error, '23505', constraint);
}

/**
 * Postgres foreign-key violation (SQLSTATE 23503) — e.g. deleting a treadmill
 * that walks still reference (`on delete restrict`, spec § 6.11.4).
 */
export function isForeignKeyViolation(error: unknown, constraint?: string): boolean {
  return isPgViolation(error, '23503', constraint);
}

/** Walks the `cause` chain looking for a given SQLSTATE. */
function isPgViolation(error: unknown, sqlState: string, constraint?: string): boolean {
  for (let cur: unknown = error, depth = 0; cur && depth < 6; depth += 1) {
    const e = cur as { code?: string; constraint?: string; message?: string; cause?: unknown };
    if (e.code === sqlState) {
      if (!constraint) return true;
      const text = `${e.constraint ?? ''} ${e.message ?? ''}`;
      if (text.includes(constraint)) return true;
    }
    // The constraint name may survive only in the outer wrapper's message.
    if (constraint && typeof e.message === 'string' && e.message.includes(constraint)) {
      if (findPgCode(error) === sqlState) return true;
    }
    cur = e.cause;
  }
  return false;
}

/** Finds the SQLSTATE in the cause chain. */
function findPgCode(error: unknown): string | undefined {
  for (let cur: unknown = error, depth = 0; cur && depth < 6; depth += 1) {
    const e = cur as { code?: string; cause?: unknown };
    if (typeof e.code === 'string') return e.code;
    cur = e.cause;
  }
  return undefined;
}

/** Safe JSON body parsing: an empty body yields a clear error, not a crash. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
