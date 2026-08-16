import { NextResponse } from 'next/server';

import {
  apiError,
  handle,
  isForeignKeyViolation,
  isUniqueViolation,
  readJson,
  type ApiErrorBody,
} from '@/lib/api';
import { deleteTreadmill, updateTreadmill } from '@/lib/db/queries/treadmills';
import type { TreadmillAdminDto } from '@/lib/types';
import { patchTreadmillSchema, uuidSchema } from '@/lib/validation';
import { m } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/treadmills/:id — name, speed ceiling, order or `isActive`. */
export function PATCH(request: Request, context: RouteContext) {
  return handle<TreadmillAdminDto | ApiErrorBody>(async () => {
    // Validate the uuid before querying: Postgres would 500 on a malformed value.
    const id = uuidSchema.parse((await context.params).id);
    const patch = patchTreadmillSchema.parse(await readJson(request));

    try {
      const updated = await updateTreadmill(id, patch);
      if (!updated) return apiError(404, 'NOT_FOUND', m.apiMessages.treadmillNotFound);
      return NextResponse.json(updated);
    } catch (error) {
      if (isUniqueViolation(error, 'treadmills_name_uniq')) {
        return apiError(409, 'NAME_TAKEN', m.apiMessages.treadmillNameTaken, {
          field: 'name',
        });
      }
      throw error;
    }
  });
}

/**
 * DELETE /api/treadmills/:id — only for a treadmill no walk references.
 * The FK (`on delete restrict`) is the guard: its violation becomes a 409
 * suggesting deactivation instead.
 */
export function DELETE(_request: Request, context: RouteContext) {
  return handle<{ ok: boolean } | ApiErrorBody>(async () => {
    const id = uuidSchema.parse((await context.params).id);

    try {
      const deleted = await deleteTreadmill(id);
      if (!deleted) return apiError(404, 'NOT_FOUND', m.apiMessages.treadmillNotFound);
      return NextResponse.json({ ok: true });
    } catch (error) {
      if (isForeignKeyViolation(error, 'walks_treadmill_id')) {
        return apiError(
          409,
          'TREADMILL_HAS_WALKS',
          m.apiMessages.treadmillHasWalks,
        );
      }
      throw error;
    }
  });
}
