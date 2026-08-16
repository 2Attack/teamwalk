/**
 * Leader-change detection for the podium fireworks
 * (specs/001-first-place-fireworks, spec § FR-001/FR-004).
 *
 * Pure module by design: the consumer keeps the state in a ref and layers the
 * environment gates (reduced motion, document visibility) on top of `fire`.
 */

/** Last displayed first place: standings discriminator + leader's user id. */
export interface LeaderWatchState {
  periodKey: string;
  leaderId: string;
}

export interface LeaderTransition {
  fire: boolean;
  next: LeaderWatchState | null;
}

/**
 * Advances the watch state with the freshly displayed standings.
 * Fires only for a leader change within the same period key; an initial load,
 * a period switch, or an emptied podium just re-baselines (data-model.md truth
 * table).
 */
export function observe(
  prev: LeaderWatchState | null,
  periodKey: string,
  leaderId: string | null,
): LeaderTransition {
  if (leaderId === null) return { fire: false, next: null };

  const next = { periodKey, leaderId };
  const fire =
    prev !== null && prev.periodKey === periodKey && prev.leaderId !== leaderId;
  return { fire, next };
}
