import { describe, expect, it } from 'vitest';

import { startBlocker } from '@/lib/start-blocker';
import type { TreadmillBusyDto, TreadmillDto } from '@/lib/types';

const NOW = Date.parse('2026-08-16T12:00:00Z');

function busy(walkId: string, name: string, startedAt: string, speedKmh = 5): TreadmillBusyDto {
  return { walkId, user: { id: `u-${walkId}`, name, avatarId: 'fox' }, startedAt, speedKmh };
}

function treadmill(id: string, over: Partial<TreadmillDto> = {}): TreadmillDto {
  return { id, name: `Дорожка ${id}`, maxSpeedKmh: 8, sortOrder: 1, busy: null, ...over };
}

describe('startBlocker', () => {
  it('single busy treadmill → busy card for that walk', () => {
    const t = treadmill('a', { busy: busy('w1', 'Егор', '2026-08-16T11:58:29Z') });
    const result = startBlocker([t], null, NOW);
    expect(result).toEqual({
      kind: 'busy',
      walks: [
        {
          walkId: 'w1',
          user: { id: 'u-w1', name: 'Егор', avatarId: 'fox' },
          startedAt: '2026-08-16T11:58:29Z',
          speedKmh: 5,
          treadmillName: 'Дорожка a',
        },
      ],
    });
  });

  it('all of several busy → cards ordered longest-walking first', () => {
    const short = treadmill('a', { busy: busy('w1', 'Аня', '2026-08-16T11:55:00Z') });
    const long = treadmill('b', { busy: busy('w2', 'Борис', '2026-08-16T11:30:00Z') });
    const result = startBlocker([short, long], null, NOW);
    expect(result?.kind).toBe('busy');
    if (result?.kind !== 'busy') throw new Error('expected busy');
    expect(result.walks.map((w) => w.walkId)).toEqual(['w2', 'w1']);
  });

  it('future startedAt clamps to zero elapsed and sorts last', () => {
    const future = treadmill('a', { busy: busy('w1', 'Аня', '2026-08-16T12:10:00Z') });
    const past = treadmill('b', { busy: busy('w2', 'Борис', '2026-08-16T11:59:00Z') });
    const result = startBlocker([future, past], null, NOW);
    if (result?.kind !== 'busy') throw new Error('expected busy');
    expect(result.walks.map((w) => w.walkId)).toEqual(['w2', 'w1']);
  });

  it('free treadmill selected → no blocker', () => {
    const free = treadmill('a');
    expect(startBlocker([free], free, NOW)).toBeNull();
  });

  it('nothing selected while free ones exist → text hint', () => {
    const one = treadmill('a', { busy: busy('w1', 'Егор', '2026-08-16T11:00:00Z') });
    const two = treadmill('b');
    expect(startBlocker([one, two], null, NOW)).toEqual({
      kind: 'hint',
      text: 'выберите свободную дорожку',
    });
  });

  it('selected treadmill is busy → busy card for it', () => {
    const taken = treadmill('a', { busy: busy('w1', 'Егор', '2026-08-16T11:59:00Z') });
    const free = treadmill('b');
    const result = startBlocker([taken, free], taken, NOW);
    if (result?.kind !== 'busy') throw new Error('expected busy');
    expect(result.walks.map((w) => w.walkId)).toEqual(['w1']);
  });
});
