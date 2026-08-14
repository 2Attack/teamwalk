import { NextResponse } from 'next/server';

import { apiError, handle, type ApiErrorBody } from '@/lib/api';
import { getRouteImage } from '@/lib/db/queries/routes';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/routes/:id/image — the binary map background (spec § 6.12.5).
 * The URL carries a version query param derived from map_image_generated_at,
 * so the response can be cached as immutable: a regenerated image gets a new
 * URL, the old one simply stops being referenced.
 */
export function GET(_request: Request, context: RouteContext) {
  return handle<Buffer | ApiErrorBody>(async () => {
    const id = uuidSchema.parse((await context.params).id);
    const png = await getRouteImage(id);
    if (!png) return apiError(404, 'NOT_FOUND', 'У маршрута нет фона карты');

    return new NextResponse(new Uint8Array(png), {
      headers: {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    }) as NextResponse<Buffer>;
  });
}
