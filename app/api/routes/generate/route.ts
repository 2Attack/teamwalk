import { NextResponse } from 'next/server';

import { apiError, handle, readJson, type ApiErrorBody } from '@/lib/api';
import { llmEnabled } from '@/lib/hints/providers';
import { generateRouteDraft } from '@/lib/routes/generate';
import type { RouteDraftDto } from '@/lib/types';
import { generateRouteSchema } from '@/lib/validation';
import { m } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/routes/generate — AI route draft. The only place
 * in the product where the user consciously waits for the LLM: an explicit
 * admin click, a timeout, and an honest error leaving the editor manual.
 * Writes nothing to the DB — the draft goes back into the editor.
 */
export async function POST(request: Request) {
  return handle<RouteDraftDto | ApiErrorBody>(async () => {
    if (!llmEnabled()) {
      return apiError(503, 'LLM_DISABLED', m.apiMessages.generationUnavailable);
    }

    const input = generateRouteSchema.parse(await readJson(request));
    const draft = await generateRouteDraft(input.prompt, input.cities);
    if (!draft) {
      return apiError(
        502,
        'INTERNAL_ERROR',
        m.apiMessages.generationFailed,
      );
    }
    return NextResponse.json(draft);
  });
}
