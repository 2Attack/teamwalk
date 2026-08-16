import { waitUntil } from '@vercel/functions';
import { desc, eq, lt, sql } from 'drizzle-orm';

import { HINTS_POOL_MAX, HINTS_POOL_MIN, HINTS_TTL_MINUTES } from '@/lib/config';
import { db } from '@/lib/db';
import { hintsCache, hintsMeta } from '@/lib/db/schema';
import { LOCALE } from '@/lib/i18n';
import { shuffle } from '@/lib/random';
import type { HintDto, HintsResponseDto } from '@/lib/types';
import { hintToneSchema } from '@/lib/validation';

import { regenerateHints } from './generate';
import { staticHintDtos } from './registry';

/**
 * Pool serving and lazy regeneration.
 *
 * Key property: no LLM call in the hot path, by construction. The cache is
 * served immediately even when stale; the refresh runs in the background
 * after the response has been sent.
 */

interface CacheRow {
  id: string;
  text: string;
  tone: string;
  subjectId: string | null;
  source: string;
  generatedAt: Date;
}

function toDto(row: CacheRow): HintDto {
  const tone = hintToneSchema.safeParse(row.tone);
  return {
    id: row.id,
    // `tone` is plain text in the DB: an unexpected value must not break
    // the feed over a single row.
    tone: tone.success ? tone.data : 'neutral',
    text: row.text,
    source: row.source === 'llm' ? 'llm' : 'static',
  };
}


/**
 * Selection rules: at most one tease per person, and when a specific user is
 * requested their phrase is guaranteed into the pool (otherwise the active
 * walk screen would never show them their own line).
 */
function applySelectionRules(rows: readonly CacheRow[], userId?: string): CacheRow[] {
  const teased = new Set<string>();
  const allowed = rows.filter((row) => {
    if (row.tone !== 'tease' || !row.subjectId) return true;
    if (teased.has(row.subjectId)) return false;
    teased.add(row.subjectId);
    return true;
  });

  const shuffled = shuffle(allowed);
  if (!userId) return shuffled;

  const own = shuffled.filter((row) => row.subjectId === userId);
  const rest = shuffled.filter((row) => row.subjectId !== userId);
  return [...own.slice(0, 1), ...rest, ...own.slice(1)];
}

/** Pool of 8–12 lines. Never empty: the static catalog is the bottom of the chain. */
export async function getHintsPool(userId?: string): Promise<HintsResponseDto> {
  // Rows of another locale (left over after a NEXT_PUBLIC_LOCALE switch) are
  // ignored: static filler in the new language is better than a mixed feed.
  const rows = (await db
    .select()
    .from(hintsCache)
    .where(eq(hintsCache.locale, LOCALE))
    .orderBy(desc(hintsCache.generatedAt))
    .limit(HINTS_POOL_MAX * 4)) as CacheRow[];

  const fromCache = applySelectionRules(rows, userId).slice(0, HINTS_POOL_MAX).map(toDto);

  // Cache below the pool minimum (or empty) — top up with static, no duplicates.
  const seen = new Set(fromCache.map((hint) => hint.text));
  const missing = Math.max(0, HINTS_POOL_MIN - fromCache.length);
  const filler = shuffle(staticHintDtos().filter((hint) => !seen.has(hint.text))).slice(0, missing);
  const hints = [...fromCache, ...filler];

  const generatedAt = rows.length > 0 ? new Date(rows[0].generatedAt).toISOString() : null;
  return { hints, generatedAt };
}

/**
 * The pool is stale when the freshest row of the active locale is older than
 * the TTL. Counting only the active locale makes a locale switch regenerate
 * immediately instead of waiting out the old pool's TTL.
 */
async function isStale(): Promise<boolean> {
  const rows = await db
    .select({ latest: sql<string | null>`max(${hintsCache.generatedAt})` })
    .from(hintsCache)
    .where(eq(hintsCache.locale, LOCALE));
  const latest = rows[0]?.latest;
  if (!latest) return true;
  return Date.now() - new Date(latest).getTime() > HINTS_TTL_MINUTES * 60_000;
}

/**
 * Single-query lock. Postgres advisory locks do not fit: they are session
 * scoped, and the stateless Neon HTTP driver sends each command as its own
 * request. An empty result means another instance already started.
 */
async function acquireLock(): Promise<boolean> {
  await db.insert(hintsMeta).values({ id: true }).onConflictDoNothing();
  const locked = await db
    .update(hintsMeta)
    .set({ lockedUntil: sql`now() + interval '2 minutes'` })
    .where(lt(hintsMeta.lockedUntil, sql`now()`))
    .returning({ id: hintsMeta.id });
  return locked.length > 0;
}

async function refreshIfStale(): Promise<void> {
  if (!(await isStale())) return;
  if (!(await acquireLock())) {
    console.info('[hints] regeneration already locked by another instance');
    return;
  }
  await regenerateHints();
}

/**
 * Lazy stale-while-revalidate regeneration. Returns immediately: the work
 * goes to `waitUntil` and outlives the response. Errors are swallowed —
 * hint freshness is not worth a 500 on the home page.
 */
export function ensureFreshPool(): void {
  waitUntil(
    refreshIfStale().catch((error) => {
      console.error('[hints] background regeneration failed', error);
    }),
  );
}
