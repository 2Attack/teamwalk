import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

/** Единый формат ошибок API (п. 5 ТЗ). */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'NAME_TAKEN'
  | 'WALK_ALREADY_ACTIVE'
  | 'TREADMILL_BUSY'
  | 'TREADMILL_INACTIVE'
  | 'NO_TREADMILLS'
  | 'SPEED_OUT_OF_RANGE'
  | 'WALK_NOT_ACTIVE'
  | 'DELETE_WINDOW_EXPIRED'
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
  return apiError(400, 'VALIDATION_ERROR', first?.message ?? 'Некорректные данные', {
    field: first?.path.join('.') || undefined,
    details: error.issues,
  });
}

/** Обёртка хендлера: ловит Zod и неожиданные ошибки, логирует, отдаёт конверт. */
export async function handle<T>(fn: () => Promise<NextResponse<T>>) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ZodError) return validationError(error);
    console.error('[api] unhandled error', error);
    return apiError(500, 'INTERNAL_ERROR', 'Что-то пошло не так. Попробуйте ещё раз');
  }
}

/**
 * Постгрес-ошибка нарушения уникальности.
 *
 * Drizzle заворачивает ошибку драйвера в `DrizzleQueryError`, у которой нет `code`,
 * поэтому проверять надо всю цепочку `cause` — иначе гонка на partial unique index
 * уедет клиенту как 500 вместо понятного 409.
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  for (let cur: unknown = error, depth = 0; cur && depth < 6; depth += 1) {
    const e = cur as { code?: string; constraint?: string; message?: string; cause?: unknown };
    if (e.code === '23505') {
      if (!constraint) return true;
      const text = `${e.constraint ?? ''} ${e.message ?? ''}`;
      if (text.includes(constraint)) return true;
    }
    // Имя индекса может остаться только в тексте внешней обёртки.
    if (constraint && typeof e.message === 'string' && e.message.includes(constraint)) {
      if (findPgCode(error) === '23505') return true;
    }
    cur = e.cause;
  }
  return false;
}

/** Ищет SQLSTATE в цепочке причин. */
function findPgCode(error: unknown): string | undefined {
  for (let cur: unknown = error, depth = 0; cur && depth < 6; depth += 1) {
    const e = cur as { code?: string; cause?: unknown };
    if (typeof e.code === 'string') return e.code;
    cur = e.cause;
  }
  return undefined;
}

/** Безопасный разбор JSON-тела: пустое тело — понятная ошибка, а не краш. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
