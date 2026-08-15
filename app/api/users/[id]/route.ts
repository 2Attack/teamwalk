import { NextResponse } from 'next/server';

import type { ApiErrorBody } from '@/lib/api';
import { apiError, handle, isUniqueViolation, readJson } from '@/lib/api';
import { getUser, updateUser } from '@/lib/db/queries/users';
import type { UserDto } from '@/lib/types';
import { patchUserSchema, uuidSchema } from '@/lib/validation';
import { m } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/users/:id — карточка участника. */
export function GET(_request: Request, context: RouteContext) {
  return handle<UserDto | ApiErrorBody>(async () => {
    // Валидация uuid до запроса: иначе Postgres упадёт на кривом значении с 500 вместо 400.
    const id = uuidSchema.parse((await context.params).id);
    const user = await getUser(id);
    if (!user) return apiError(404, 'NOT_FOUND', m.apiMessages.userNotFound);
    return NextResponse.json(user);
  });
}

/** PATCH /api/users/:id — смена имени, аватара или флага хинтов (п. 5.1, 6.5). */
export function PATCH(request: Request, context: RouteContext) {
  return handle<UserDto | ApiErrorBody>(async () => {
    const id = uuidSchema.parse((await context.params).id);
    const patch = patchUserSchema.parse(await readJson(request));

    try {
      const user = await updateUser(id, patch);
      if (!user) return apiError(404, 'NOT_FOUND', m.apiMessages.userNotFound);
      return NextResponse.json(user);
    } catch (error) {
      // Тот же индекс users_name_uniq: конфликт ловим по ошибке БД, а не предпроверкой.
      if (isUniqueViolation(error, 'users_name_uniq')) {
        return apiError(409, 'NAME_TAKEN', m.apiMessages.userNameTaken, {
          field: 'name',
        });
      }
      throw error;
    }
  });
}
