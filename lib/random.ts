/**
 * Перемешивание для выдачи хинтов.
 *
 * Живёт отдельным модулем, потому что нужно в двух местах: `hints/select.ts`
 * тасует статику перед показом, `hints/generate.ts` — перед добивкой пула.
 * Без общего места второй вызов пришлось бы дублировать.
 */

/** Тасование Фишера — Йетса по копии: исходный массив не мутируем. */
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
