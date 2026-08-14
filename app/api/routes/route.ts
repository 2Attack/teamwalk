import { NextResponse } from 'next/server';

import { apiError, handle, isUniqueViolation, readJson, type ApiErrorBody } from '@/lib/api';
import { createRoute, listRoutesAdmin } from '@/lib/db/queries/routes';
import { llmEnabled } from '@/lib/hints/providers';
import { scheduleMapLayout } from '@/lib/routes/generate';
import type { RouteAdminDto, RoutesAdminResponseDto } from '@/lib/types';
import { createRouteSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/routes — the settings list: all routes with points (spec § 5.6). */
export async function GET() {
  return handle<RoutesAdminResponseDto | ApiErrorBody>(async () => {
    return NextResponse.json({ routes: await listRoutesAdmin(), llmEnabled: llmEnabled() });
  });
}

/** POST /api/routes — create a route with its points (spec § 6.12.2). */
export async function POST(request: Request) {
  return handle<RouteAdminDto | ApiErrorBody>(async () => {
    const input = createRouteSchema.parse(await readJson(request));

    try {
      const created = await createRoute(input);
      // Map layout arrives in the background (spec § 6.12.5); until then the
      // deterministic layout serves the map.
      scheduleMapLayout(created.id, created.points);
      return NextResponse.json(created, { status: 201 });
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
