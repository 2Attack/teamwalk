'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/8bit/alert';
import { Icon } from '@/components/ui/icon';
import { useHints } from '@/lib/client/api';
import { cn } from '@/lib/cn';
import { m } from '@/lib/i18n';
import type { HintDto } from '@/lib/types';

interface HintTickerProps {
  userId?: string | null;
  variant?: 'home' | 'walk';
  className?: string;
}

/** Rotation intervals: home 7 s, walk 10 s, reduced-motion 12 s. */
const INTERVAL_MS = { home: 7_000, walk: 10_000, reduced: 12_000 } as const;
/** Typing must not eat into reading time: 20 ms per char, capped at 2.4 s total. */
const TYPE_CHAR_MS = 20;
const TYPE_TOTAL_MAX_MS = 2_400;

/** The API contract guarantees a non-empty pool, but an empty panel would look broken. */
const FALLBACK: HintDto = {
  id: 'fallback',
  tone: 'neutral',
  text: m.hintsUi.fallback,
  source: 'static',
};

/** Fisher–Yates over a copy: the source pool is not mutated. */
function shuffle(items: readonly HintDto[]): HintDto[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}

/** New round: reshuffle, making sure the first phrase doesn't repeat the last one. */
function reshuffle(items: readonly HintDto[], lastId: string | null): HintDto[] {
  const next = shuffle(items);
  if (next.length > 1 && next[0].id === lastId) return [next[1], next[0], ...next.slice(2)];
  return next;
}

/**
 * Number of characters "typed" so far. One timer and one counter — do not
 * rebuild this as per-character CSS animations: with 80–140 chars restarting
 * every 7 s the tail animations stall and phrases get cut off mid-word.
 */
function useTypedCount(text: string, enabled: boolean): number {
  const total = text.length;
  const [count, setCount] = useState(enabled ? 0 : total);

  useEffect(() => {
    if (!enabled) {
      setCount(total);
      return;
    }
    setCount(0);
    if (total === 0) return;

    // Typing must not eat into reading time: 20 ms per char, capped at 2.4 s total.
    const stepMs = Math.max(1, Math.min(TYPE_CHAR_MS, TYPE_TOTAL_MAX_MS / total));
    const timer = window.setInterval(() => {
      setCount((value) => {
        if (value >= total) {
          window.clearInterval(timer);
          return total;
        }
        return value + 1;
      });
    }, stepMs);

    return () => window.clearInterval(timer);
  }, [text, total, enabled]);

  return count;
}

function useReducedMotionPreference(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return reduced;
}

/**
 * NPC dialog box on 8bitcn `Alert`; phrase text is pixel font
 * (`font="retro"`), like an NPC line in a console game.
 *
 * The cost is block height: Press Start 2P glyph width equals the font size,
 * and phrases run up to 140 chars — 6–7 lines on a phone. Height is fixed in
 * `lh` units for the worst case so phrase changes don't shift layout; short
 * phrases leave the bottom empty, which is fine for a dialog box.
 * `hyphens-auto` (html has lang="ru") avoids a ragged right edge that would
 * cost another line in monospaced text.
 *
 * Exactly one `<p>` exists at a time: phrase change swaps the `key`. No
 * cross-fade on purpose — it overlapped two phrases inside the fixed-height
 * box and made the feed unreadable.
 */
export function HintTicker({ userId = null, variant = 'home', className }: HintTickerProps) {
  const { data } = useHints(userId ?? null);
  const reduced = useReducedMotionPreference();
  // Hover and focus are tracked separately: otherwise mouse-leave would unpause
  // a phrase the user is reading with keyboard focus on the panel.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [order, setOrder] = useState<HintDto[]>([]);
  const [index, setIndex] = useState(0);

  const pool = useMemo<HintDto[]>(() => (data?.hints.length ? data.hints : [FALLBACK]), [data]);
  const poolKey = pool.map((hint) => hint.id).join('|');

  // The whole pool refreshes every few minutes — compare by id composition.
  useEffect(() => {
    setOrder(shuffle(pool));
    setIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolKey]);

  const current = order[index] ?? pool[0];

  /** Cycle without repeats: when the round ends, the pool is reshuffled. */
  const advance = useCallback(() => {
    if (index + 1 < order.length) {
      setIndex(index + 1);
      return;
    }
    setOrder(reshuffle(pool, order[index]?.id ?? null));
    setIndex(0);
  }, [index, order, pool]);

  const intervalMs = reduced ? INTERVAL_MS.reduced : INTERVAL_MS[variant];
  const paused = hovered || focused;

  useEffect(() => {
    if (paused || order.length < 2) return;
    // The timer is recreated after every change, so unpausing always grants
    // a full reading interval, not the remainder of the previous one.
    const timer = window.setInterval(advance, intervalMs);
    return () => window.clearInterval(timer);
  }, [paused, order.length, intervalMs, advance]);

  const text = current?.text ?? '';
  // `prefers-reduced-motion` disables typing entirely — the phrase appears at once.
  const typed = useTypedCount(text, !reduced);
  const isWalk = variant === 'walk';

  return (
    <section
      aria-label={m.hintsUi.tickerAria}
      className={cn('w-full', className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <Alert
        font="retro"
        /*
          `Alert` ships with `role="alert"` (implicit `aria-live="assertive"`);
          for a feed that rotates every 7 s the screen reader would interrupt
          on every phrase. Explicit `aria-live="off"` overrides the role's
          implicit value.
        */
        aria-live="off"
        aria-atomic="false"
        // Icon is wrapped in a <span>, so the base Alert's column variant
        // (it looks for a direct <svg> child) won't kick in: set the
        // icon + text grid explicitly.
        className="grid-cols-[auto_1fr] items-start gap-x-3 px-4 py-4"
      >
        {/* NPC dialog icon from the shared pixel set. */}
        <Icon name="hint" size={isWalk ? 24 : 16} className="mt-0.5" />

        <AlertDescription
          className={cn(
            /*
              Box height is in `lh` units, so the container's line-height must
              match the paragraph's — hence the `!`: base `AlertDescription`
              forces its own line-height via `[&_p]`, and `text-xs` brings its
              own too; both are overridden explicitly.

              Font size trades readability for box height: phone gets the
              minimum at which Press Start 2P is still legible; wider screens
              get larger (on the treadmill the phrase is read from ~1.5 m). Line count fits the worst 140-char phrase, so
              hint changes don't shift layout.
            */
            'block min-w-0 overflow-hidden text-text-main leading-[1.7]!',
            /*
              Font size grows at `md`, not `sm`: at 640 px the column is still
              narrow and a larger size there yields the worst wrapping
              (6 lines vs 4). By 768 px there is enough width.
            */
            isWalk ? 'text-xs md:text-base' : 'text-[10px] md:text-xs',
            'h-[7lh] md:h-[4lh]',
          )}
        >
          <p
            key={current.id}
            // Line-height mirrors the parent (also with `!`): the box height is
            // defined in its lines, and base `AlertDescription` would otherwise
            // impose its own on the paragraph.
            className="m-0 hyphens-auto break-words leading-[1.7]!"
          >
            {text.slice(0, typed)}
            {/*
              The untyped tail stays in flow, invisible: line wrapping is
              computed for the whole phrase, so it doesn't reflow on every
              character.
            */}
            <span aria-hidden="true" className="invisible">
              {text.slice(typed)}
            </span>
          </p>
        </AlertDescription>
      </Alert>
    </section>
  );
}
