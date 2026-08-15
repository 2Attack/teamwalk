import { NextResponse } from 'next/server';

import type { ApiErrorBody } from '@/lib/api';
import { apiError, handle, isUniqueViolation, readJson } from '@/lib/api';
import { createUser, listUsers } from '@/lib/db/queries/users';
import type { UserDto } from '@/lib/types';
import { createUserSchema } from '@/lib/validation';
import { m } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/users — member list sorted by name (spec § 5.1). */
export function GET() {
  return handle<UserDto[] | ApiErrorBody>(async () => {
    const users = await listUsers();
    return NextResponse.json(users);
  });
}

/** POST /api/users — create a member (spec § 6.2). */
export function POST(request: Request) {
  return handle<UserDto | ApiErrorBody>(async () => {
    // The schema normalizes the name (trim, collapse spaces, Title Case) and
    // validates avatarId against the preset catalog.
    const input = createUserSchema.parse(await readJson(request));

    try {
      const user = await createUser(input);
      return NextResponse.json(user, { status: 201 });
    } catch (error) {
      // Name uniqueness is case- and whitespace-insensitive, enforced by the
      // users_name_uniq index rather than a pre-SELECT (race-prone).
      if (isUniqueViolation(error, 'users_name_uniq')) {
        return apiError(409, 'NAME_TAKEN', m.apiMessages.userNameTaken, {
          field: 'name',
        });
      }
      throw error;
    }
  });
}
