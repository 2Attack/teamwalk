import { NextResponse } from 'next/server';

import { apiError, handle, isUniqueViolation, readJson, type ApiErrorBody } from '@/lib/api';
import { createTreadmill, listAllTreadmills } from '@/lib/db/queries/treadmills';
import { listActiveTreadmills } from '@/lib/db/queries/walks';
import type { TreadmillAdminDto, TreadmillDto } from '@/lib/types';
import { createTreadmillSchema } from '@/lib/validation';
import { closeStaleWalks } from '@/lib/walks/autoclose';
import { m } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/treadmills — active treadmills with current occupancy (spec § 6.9.6).
 * `?scope=all` returns every treadmill, inactive included, in the admin shape
 * for the settings screen (spec § 6.11.2).
 *
 * Auto-close runs here in both modes: occupancy is read most often, and a
 * freed treadmill must not linger as busy (spec § 7.6).
 */
export async function GET(request: Request) {
  return handle<TreadmillDto[] | TreadmillAdminDto[] | ApiErrorBody>(async () => {
    await closeStaleWalks();
    const scope = new URL(request.url).searchParams.get('scope');
    if (scope === 'all') return NextResponse.json(await listAllTreadmills());
    return NextResponse.json(await listActiveTreadmills());
  });
}

/** POST /api/treadmills — create a treadmill from the settings screen (spec § 6.11.3). */
export async function POST(request: Request) {
  return handle<TreadmillAdminDto | ApiErrorBody>(async () => {
    const input = createTreadmillSchema.parse(await readJson(request));

    try {
      const created = await createTreadmill(input);
      return NextResponse.json(created, { status: 201 });
    } catch (error) {
      // The `treadmills_name_uniq` index is the source of truth for name
      // conflicts — no pre-check, races are caught by the DB error.
      if (isUniqueViolation(error, 'treadmills_name_uniq')) {
        return apiError(409, 'NAME_TAKEN', m.apiMessages.treadmillNameTaken, {
          field: 'name',
        });
      }
      throw error;
    }
  });
}
