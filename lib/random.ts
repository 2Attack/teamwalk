/**
 * Shuffling for hint delivery. Separate module because both `hints/select.ts`
 * and `hints/generate.ts` need it.
 */

/** Fisher-Yates shuffle over a copy: the input array is never mutated. */
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
