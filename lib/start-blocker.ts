import { elapsedSec } from '@/lib/format';
import { m } from '@/lib/i18n';
import type { TreadmillBusyDto, TreadmillDto } from '@/lib/types';

/** Data for one in-progress walk card in the start-block blocker zone. */
export interface BusyWalkCardData {
  walkId: string;
  user: TreadmillBusyDto['user'];
  startedAt: string;
  speedKmh: number;
  treadmillName: string;
}

/**
 * Why starting is impossible; `null` — it is possible.
 * `busy` renders as tappable walk cards, `hint` as a plain text row.
 */
export type StartBlocker =
  | { kind: 'busy'; walks: BusyWalkCardData[] }
  | { kind: 'hint'; text: string }
  | null;

function toCard(treadmill: TreadmillDto, busy: TreadmillBusyDto): BusyWalkCardData {
  return {
    walkId: busy.walkId,
    user: busy.user,
    startedAt: busy.startedAt,
    speedKmh: busy.speedKmh,
    treadmillName: treadmill.name,
  };
}

export function startBlocker(
  list: TreadmillDto[],
  selected: TreadmillDto | null,
  now: number,
): StartBlocker {
  const busyCards = list
    .filter((t): t is TreadmillDto & { busy: TreadmillBusyDto } => t.busy !== null)
    .map((t) => toCard(t, t.busy))
    // The nearest release time is unknown — show whoever has walked longest first.
    .sort((a, b) => elapsedSec(b.startedAt, now) - elapsedSec(a.startedAt, now));

  const allBusy = list.length > 0 && busyCards.length === list.length;
  if (allBusy) return { kind: 'busy', walks: busyCards };
  if (selected === null) return { kind: 'hint', text: m.startCard.blockerChooseFree };
  if (selected.busy) return { kind: 'busy', walks: [toCard(selected, selected.busy)] };
  return null;
}
