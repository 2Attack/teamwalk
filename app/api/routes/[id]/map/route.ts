import { NextResponse } from 'next/server';

import { apiError, handle, type ApiErrorBody } from '@/lib/api';
import { getRouteAdmin, saveMapLayout } from '@/lib/db/queries/routes';
import { llmEnabled } from '@/lib/hints/providers';
import { generateMapLayout } from '@/lib/routes/generate';
import type { RouteAdminDto } from '@/lib/types';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/routes/:id/map — regenerate the AI map layout on demand
 * (spec § 6.12.5). Waits for the LLM like /generate does: an explicit admin
 * click in the editor, not a hot path.
 */
export function POST(_request: Request, context: RouteContext) {
  return handle<RouteAdminDto | ApiErrorBody>(async () => {
    if (!llmEnabled()) {
      return apiError(503, 'LLM_DISABLED', 'Генерация недоступна: LLM-креды не настроены');
    }

    const id = uuidSchema.parse((await context.params).id);
    const route = await getRouteAdmin(id);
    if (!route) return apiError(404, 'NOT_FOUND', 'Маршрут не найден');

    const layout = await generateMapLayout(route.points);
    if (!layout) {
      return apiError(
        502,
        'INTERNAL_ERROR',
        'Не удалось сгенерировать раскладку — карта останется автоматической',
      );
    }

    await saveMapLayout(id, layout);
    const updated = await getRouteAdmin(id);
    return NextResponse.json(updated ?? route);
  });
}
