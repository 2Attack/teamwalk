import { NextResponse } from 'next/server';

import { apiError, handle, readJson, type ApiErrorBody } from '@/lib/api';
import { activateRoute } from '@/lib/db/queries/routes';
import type { RouteAdminDto } from '@/lib/types';
import { activateRouteSchema, uuidSchema } from '@/lib/validation';
import { m } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/routes/:id/activate — route selection (spec § 6.12.2). A separate
 * action rather than PATCH { isActive }: it has the base_km side effect and a
 * mandatory confirmation in the UI. `resetProgress: true` moves base_km to the
 * current all-time total, so the route starts from zero.
 */
export function POST(request: Request, context: RouteContext) {
  return handle<RouteAdminDto | ApiErrorBody>(async () => {
    const id = uuidSchema.parse((await context.params).id);
    const { resetProgress } = activateRouteSchema.parse(await readJson(request));

    const activated = await activateRoute(id, resetProgress);
    if (!activated) return apiError(404, 'NOT_FOUND', m.apiMessages.routeNotFound);
    return NextResponse.json(activated);
  });
}
