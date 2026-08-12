import { NextResponse } from 'next/server';

import type { ApiErrorBody } from '@/lib/api';
import { apiError, handle, isUniqueViolation, readJson } from '@/lib/api';
import { createUser, listUsers } from '@/lib/db/queries/users';
import type { UserDto } from '@/lib/types';
import { createUserSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/users — список участников, отсортированный по имени (п. 5.1). */
export function GET() {
  return handle<UserDto[] | ApiErrorBody>(async () => {
    const users = await listUsers();
    return NextResponse.json(users);
  });
}

/** POST /api/users — создание участника (п. 6.2). */
export function POST(request: Request) {
  return handle<UserDto | ApiErrorBody>(async () => {
    // Схема сама нормализует имя (trim, схлопывание пробелов, Заглавные Буквы)
    // и проверяет avatarId по каталогу пресетов.
    const input = createUserSchema.parse(await readJson(request));

    try {
      const user = await createUser(input);
      return NextResponse.json(user, { status: 201 });
    } catch (error) {
      // Уникальность имени регистронезависима и нечувствительна к пробелам —
      // это обеспечивает индекс users_name_uniq, а не предварительный SELECT (гонка).
      if (isUniqueViolation(error, 'users_name_uniq')) {
        return apiError(409, 'NAME_TAKEN', 'Участник с таким именем уже есть в списке', {
          field: 'name',
        });
      }
      throw error;
    }
  });
}
