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

/** GET /api/users/:id — member card. */
export function GET(_request: Request, context: RouteContext) {
  return handle<UserDto | ApiErrorBody>(async () => {
    // Validate uuid before querying: Postgres would fail on a malformed value with 500 instead of 400.
    const id = uuidSchema.parse((await context.params).id);
    const user = await getUser(id);
    if (!user) return apiError(404, 'NOT_FOUND', m.apiMessages.userNotFound);
    return NextResponse.json(user);
  });
}

/** PATCH /api/users/:id — change name, avatar, or hints flag. */
export function PATCH(request: Request, context: RouteContext) {
  return handle<UserDto | ApiErrorBody>(async () => {
    const id = uuidSchema.parse((await context.params).id);
    const patch = patchUserSchema.parse(await readJson(request));

    try {
      const user = await updateUser(id, patch);
      if (!user) return apiError(404, 'NOT_FOUND', m.apiMessages.userNotFound);
      return NextResponse.json(user);
    } catch (error) {
      // Same users_name_uniq index: catch the conflict via the DB error, not a pre-check.
      if (isUniqueViolation(error, 'users_name_uniq')) {
        return apiError(409, 'NAME_TAKEN', m.apiMessages.userNameTaken, {
          field: 'name',
        });
      }
      throw error;
    }
  });
}
