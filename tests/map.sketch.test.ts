import { describe, expect, it } from 'vitest';

import { ROUTE } from '@/lib/hints/route';
import { fallbackLayout } from '@/lib/map/layout';
import { renderSketch } from '@/lib/routes/map-image';

/**
 * The init sketch of the map background (spec § 6.12.5): the LLM-free half of
 * the image pipeline, so it is testable without credentials.
 */
describe('renderSketch', () => {
  it('produces a PNG and is deterministic for the same layout', async () => {
    const layout = fallbackLayout(ROUTE);
    const a = await renderSketch(ROUTE, layout);
    const b = await renderSketch(ROUTE, layout);

    // PNG magic bytes.
    expect([...a.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(a.equals(b)).toBe(true);
    // A sketch with content is far bigger than an empty parchment fill.
    expect(a.length).toBeGreaterThan(1_000);
  });
});
