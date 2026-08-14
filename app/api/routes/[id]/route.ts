import { NextResponse } from 'next/server';

import { apiError, handle, isUniqueViolation, readJson, type ApiErrorBody } from '@/lib/api';
import { deleteRoute, updateRoute } from '@/lib/db/queries/routes';
import type { RouteAdminDto } from '@/lib/types';
import { patchRouteSchema, uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/routes/:id — name and/or the whole points array (spec § 6.12.2). */
export function PATCH(request: Request, context: RouteContext) {
  return handle<RouteAdminDto | ApiErrorBody>(async () => {
    const id = uuidSchema.parse((await context.params).id);
    const patch = patchRouteSchema.parse(await readJson(request));

    try {
      const updated = await updateRoute(id, patch);
      if (!updated) return apiError(404, 'NOT_FOUND', 'Маршрут не найден');
      return NextResponse.json(updated);
    } catch (error) {
      if (isUniqueViolation(error, 'routes_name_uniq')) {
        return apiError(409, 'NAME_TAKEN', 'Маршрут с таким названием уже есть', {
          field: 'name',
        });
      }
      throw error;
    }
  });
}

/**
 * DELETE /api/routes/:id — any route, the active one included (spec § 6.12.2):
 * routes are optional (spec § 6.12.6), deleting the active route just yields
 * the "no route selected" state. The confirmation lives in the UI.
 */
export function DELETE(_request: Request, context: RouteContext) {
  return handle<{ ok: boolean } | ApiErrorBody>(async () => {
    const id = uuidSchema.parse((await context.params).id);

    const deleted = await deleteRoute(id);
    if (!deleted) return apiError(404, 'NOT_FOUND', 'Маршрут не найден');
    return NextResponse.json({ ok: true });
  });
}
