import { NextResponse } from 'next/server';

import { apiError, handle, isUniqueViolation, readJson, type ApiErrorBody } from '@/lib/api';
import { createRoute, listRoutesAdmin } from '@/lib/db/queries/routes';
import { llmEnabled } from '@/lib/hints/providers';
import type { RouteAdminDto, RoutesAdminResponseDto } from '@/lib/types';
import { createRouteSchema } from '@/lib/validation';
import { m } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/routes — the settings list: all routes with points. */
export async function GET() {
  return handle<RoutesAdminResponseDto | ApiErrorBody>(async () => {
    return NextResponse.json({ routes: await listRoutesAdmin(), llmEnabled: llmEnabled() });
  });
}

/** POST /api/routes — create a route with its points. */
export async function POST(request: Request) {
  return handle<RouteAdminDto | ApiErrorBody>(async () => {
    const input = createRouteSchema.parse(await readJson(request));

    try {
      const created = await createRoute(input);
      return NextResponse.json(created, { status: 201 });
    } catch (error) {
      if (isUniqueViolation(error, 'routes_name_uniq')) {
        return apiError(409, 'NAME_TAKEN', m.apiMessages.routeNameTaken, {
          field: 'name',
        });
      }
      throw error;
    }
  });
}
