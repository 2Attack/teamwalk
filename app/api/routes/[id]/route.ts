import { NextResponse } from 'next/server';

import { apiError, handle, isUniqueViolation, readJson, type ApiErrorBody } from '@/lib/api';
import { deleteRoute, updateRoute } from '@/lib/db/queries/routes';
import { scheduleMapLayout } from '@/lib/routes/generate';
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
      // Editing points dropped the stored layout — regenerate in background.
      if (patch.points !== undefined) scheduleMapLayout(updated.id, updated.points);
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
 * DELETE /api/routes/:id — non-active routes only; the last remaining route is
 * also protected: the product always stands on some route (spec § 6.12.2).
 */
export function DELETE(_request: Request, context: RouteContext) {
  return handle<{ ok: boolean } | ApiErrorBody>(async () => {
    const id = uuidSchema.parse((await context.params).id);

    const result = await deleteRoute(id);
    if (result === 'deleted') return NextResponse.json({ ok: true });
    if (result === 'not_found') return apiError(404, 'NOT_FOUND', 'Маршрут не найден');
    if (result === 'active') {
      return apiError(409, 'ROUTE_ACTIVE', 'Активный маршрут удалить нельзя — сначала выберите другой');
    }
    return apiError(409, 'ROUTE_ACTIVE', 'Нельзя удалить последний маршрут');
  });
}
