import {
  HINTS_ENABLED,
  HINTS_MIN_AFTER_FILTER,
  HINTS_POOL_MAX,
} from '@/lib/config';
import { db } from '@/lib/db';
import { hintsCache } from '@/lib/db/schema';
import { shuffle } from '@/lib/random';
import type { LlmHint } from '@/lib/validation';

import { rejectReason } from './filter';
import type { PoolRow } from './registry';
import { staticPoolRows } from './registry';
import { requestHints } from './providers';
import type { SnapshotResult } from './snapshot';
import { buildSnapshot } from './snapshot';

/**
 * Оркестрация генерации пула (пп. 6.6.4–6.6.7 ТЗ):
 * снапшот → LLM → Zod → постфильтр → правила подбора → подстановка имён → запись.
 *
 * Функция вызывается только из фона (`waitUntil`), в горячем пути её нет.
 */

const PLACEHOLDER = /\{\{(u\d+)\}\}/g;

/**
 * Подстановка реальных имён происходит на нашей стороне (п. 6.6.2). Если модель
 * сослалась на слот, которого нет в снапшоте, фразу выбрасываем: подставить
 * нечего, а «{{u9}}» на общем экране — хуже, чем на одну шутку меньше.
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

/** Фразы LLM → строки пула. Всё, что не прошло, логируется с причиной (п. 8). */
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

    // Новичков не подкалываем, и про одного человека не больше одной колкой
    // фразы в сутки: пул живёт час, поэтому дедупликация внутри пула и есть
    // дедупликация в сутках (п. 6.6.7).
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

    // Имена длиннее плейсхолдера — проверяем длину ещё раз уже по финальной строке.
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
 * Добивка статикой до минимума, без дублей по тексту (п. 6.6.4).
 *
 * Каталог тасуем: пул обрезается до `HINTS_POOL_MAX`, поэтому без перемешивания
 * в кэш всегда попадали бы первые фразы массива, а весь его хвост оставался бы
 * мёртвым грузом. `select.ts` тасует статику по той же причине.
 */
function topUpWithStatic(rows: readonly PoolRow[]): PoolRow[] {
  if (rows.length >= HINTS_MIN_AFTER_FILTER) return [...rows];

  const seen = new Set(rows.map((row) => row.text));
  const filler = shuffle(staticPoolRows().filter((row) => !seen.has(row.text)));
  return [...rows, ...filler].slice(0, HINTS_POOL_MAX);
}

/** Запись пула: старые строки удаляются, новые вставляются одним батчем. */
async function writePool(rows: readonly PoolRow[]): Promise<void> {
  const values = rows.map((row) => ({
    text: row.text,
    tone: row.tone,
    subjectId: row.subjectId,
    source: row.source,
  }));

  // `db.batch` у neon-http выполняет запросы одной транзакцией: пул не может
  // остаться пустым между DELETE и INSERT (интерактивных транзакций у HTTP-драйвера нет).
  await db.batch([db.delete(hintsCache), db.insert(hintsCache).values(values)]);
}

/**
 * Полная регенерация пула. Возвращает число записанных фраз; `0` означает,
 * что кэш остался прежним — пустой пул не записывается никогда (п. 6.6.5).
 */
export async function regenerateHints(): Promise<number> {
  const snapshot = await buildSnapshot();

  const stats: FilterStats = { accepted: 0, rejected: 0 };
  let rows: PoolRow[] = [];

  // Рубильник HINTS_ENABLED=false: к LLM не обращаемся вообще, пул собирается
  // из статического каталога (критерий приёмки п. 12).
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
    console.warn('[hints] пустой пул не записан, кэш оставлен прежним');
    return 0;
  }

  await writePool(pool);
  console.info('[hints] pool written', {
    total: pool.length,
    llm: pool.filter((row) => row.source === 'llm').length,
  });
  return pool.length;
}
