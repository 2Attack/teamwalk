import {
  HINTS_ENABLED,
  HINTS_MIN_AFTER_FILTER,
  HINTS_POOL_MAX,
} from '@/lib/config';
import { db } from '@/lib/db';
import { hintsCache } from '@/lib/db/schema';
import { LOCALE } from '@/lib/i18n';
import { shuffle } from '@/lib/random';
import type { LlmHint } from '@/lib/validation';

import { rejectReason } from './filter';
import type { PoolRow } from './registry';
import { staticPoolRows } from './registry';
import { requestHints } from './providers';
import type { SnapshotResult } from './snapshot';
import { buildSnapshot } from './snapshot';

/**
 * Pool generation orchestration (spec § 6.6.4–6.6.7):
 * snapshot → LLM → Zod → post-filter → selection rules → name substitution → write.
 *
 * Called only from the background (`waitUntil`), never in the hot path.
 */

const PLACEHOLDER = /\{\{(u\d+)\}\}/g;

/**
 * Real names are substituted on our side (spec § 6.6.2). A slot missing from
 * the snapshot drops the phrase: nothing to substitute, and "{{u9}}" on the
 * shared screen is worse than one joke fewer.
 */
function substituteNames(text: string, slotToName: ReadonlyMap<string, string>): string | null {
  let ok = true;
  const result = text.replace(PLACEHOLDER, (_match, slot: string) => {
    const name = slotToName.get(slot);
    if (!name) {
      ok = false;
      return '';
    }
    return name;
  });
  return ok ? result : null;
}

interface FilterStats {
  accepted: number;
  rejected: number;
}

/** LLM phrases → pool rows. Everything rejected is logged with a reason (spec § 8). */
function toPoolRows(hints: readonly LlmHint[], snapshot: SnapshotResult, stats: FilterStats): PoolRow[] {
  const teasedSubjects = new Set<string>();
  const rows: PoolRow[] = [];

  for (const hint of hints) {
    const reason = rejectReason(hint.text);
    if (reason) {
      stats.rejected += 1;
      console.warn('[hints] rejected', { reason, text: hint.text });
      continue;
    }

    const subject = hint.subject ?? null;

    // Newcomers are never teased, and at most one tease per person per day:
    // the pool lives an hour, so in-pool dedup is the daily dedup (spec § 6.6.7).
    if (hint.tone === 'tease' && subject) {
      if (snapshot.newcomerSlots.has(subject)) {
        stats.rejected += 1;
        console.warn('[hints] rejected', { reason: 'tease:newcomer', text: hint.text });
        continue;
      }
      if (teasedSubjects.has(subject)) {
        stats.rejected += 1;
        console.warn('[hints] rejected', { reason: 'tease:duplicate-subject', text: hint.text });
        continue;
      }
    }

    const text = substituteNames(hint.text, snapshot.slotToName);
    if (text === null) {
      stats.rejected += 1;
      console.warn('[hints] rejected', { reason: 'unknown-slot', text: hint.text });
      continue;
    }

    // Names are longer than placeholders — re-check length on the final string.
    const finalReason = rejectReason(text);
    if (finalReason) {
      stats.rejected += 1;
      console.warn('[hints] rejected', { reason: `after-substitution:${finalReason}`, text });
      continue;
    }

    if (hint.tone === 'tease' && subject) teasedSubjects.add(subject);
    stats.accepted += 1;
    rows.push({
      text,
      tone: hint.tone,
      subjectId: subject ? (snapshot.slotToUserId.get(subject) ?? null) : null,
      source: 'llm',
    });
  }

  return rows;
}

/**
 * Static top-up to the minimum, deduplicated by text (spec § 6.6.4).
 *
 * The catalog is shuffled: the pool is cut to `HINTS_POOL_MAX`, so without a
 * shuffle only the first array entries would ever reach the cache and the
 * tail would stay dead weight. `select.ts` shuffles static for the same reason.
 */
function topUpWithStatic(rows: readonly PoolRow[]): PoolRow[] {
  if (rows.length >= HINTS_MIN_AFTER_FILTER) return [...rows];

  const seen = new Set(rows.map((row) => row.text));
  const filler = shuffle(staticPoolRows().filter((row) => !seen.has(row.text)));
  return [...rows, ...filler].slice(0, HINTS_POOL_MAX);
}

/** Pool write: old rows deleted, new ones inserted, one batch. */
async function writePool(rows: readonly PoolRow[]): Promise<void> {
  const values = rows.map((row) => ({
    text: row.text,
    tone: row.tone,
    subjectId: row.subjectId,
    source: row.source,
    locale: LOCALE,
  }));

  // `db.batch` on neon-http runs the queries in one transaction: the pool
  // cannot be empty between DELETE and INSERT (the HTTP driver has no
  // interactive transactions).
  await db.batch([db.delete(hintsCache), db.insert(hintsCache).values(values)]);
}

/**
 * Full pool regeneration. Returns the number of rows written; `0` means the
 * cache was left as is — an empty pool is never written (spec § 6.6.5).
 */
export async function regenerateHints(): Promise<number> {
  const snapshot = await buildSnapshot();

  const stats: FilterStats = { accepted: 0, rejected: 0 };
  let rows: PoolRow[] = [];

  // HINTS_ENABLED=false kill switch: no LLM call at all, the pool is built
  // from the static catalog (acceptance criterion, spec § 12).
  const useLlm = HINTS_ENABLED && snapshot.snapshot.participants.length > 0;

  if (useLlm) {
    const result = await requestHints(snapshot.snapshot);
    if (result) {
      rows = toPoolRows(result.hints, snapshot, stats);
      console.info('[hints] filter', {
        provider: result.provider,
        received: result.hints.length,
        accepted: stats.accepted,
        rejected: stats.rejected,
      });
    }
  } else {
    console.info('[hints] llm skipped', {
      enabled: HINTS_ENABLED,
      participants: snapshot.snapshot.participants.length,
    });
  }

  const pool = topUpWithStatic(rows).slice(0, HINTS_POOL_MAX);

  if (pool.length === 0) {
    console.warn('[hints] empty pool not written, cache left as is');
    return 0;
  }

  await writePool(pool);
  console.info('[hints] pool written', {
    total: pool.length,
    llm: pool.filter((row) => row.source === 'llm').length,
  });
  return pool.length;
}
