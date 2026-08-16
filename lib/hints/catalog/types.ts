import type { HintTone } from '@/lib/types';

/** A single phrase of the static hint catalog (spec 6.6.6). */
export interface StaticHint {
  readonly text: string;
  readonly tone: HintTone;
}
