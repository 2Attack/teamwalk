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
 * Отдача пула и ленивая регенерация (п. 6.6.5, 6.6.7 ТЗ).
 *
 * Ключевое свойство: обращения к LLM в горячем пути нет по построению.
 * Кэш отдаётся немедленно, даже если он часовой давности; обновление живёт
 * в фоне после того, как ответ пользователю уже ушёл.
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
    // Тон в БД — обычный text: если туда попало что-то неожиданное,
    // лента не должна ломаться из-за одной строки.
    tone: tone.success ? tone.data : 'neutral',
    text: row.text,
    source: row.source === 'llm' ? 'llm' : 'static',
  };
}


/**
 * Правила подбора: не более одной колкой фразы про одного человека,
 * и если запрошен конкретный участник — его фраза гарантированно попадает в пул
 * (иначе на экране активной прогулки человек ни разу себя не увидит).
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

/** Пул из 8–12 строк. Никогда не пустой: на дне цепочки статический каталог. */
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

  // Кэш меньше минимального пула (или пуст) — добиваем статикой, без дублей.
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
 * Лок одним запросом. Advisory-локи Postgres здесь не подходят: они живут
 * в сессии, а HTTP-драйвер Neon стейтлесс — каждая команда идёт своим запросом.
 * Пустой результат означает, что регенерацию уже запустил другой инстанс.
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
 * Ленивая регенерация stale-while-revalidate. Возвращает управление немедленно:
 * работа уходит в `waitUntil`, функция доживает уже после ответа пользователю.
 * Любая ошибка здесь гасится — свежесть хинтов не стоит 500-й на главной.
 */
export function ensureFreshPool(): void {
  waitUntil(
    refreshIfStale().catch((error) => {
      console.error('[hints] background regeneration failed', error);
    }),
  );
}
