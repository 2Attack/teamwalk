'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/8bit/badge';
import { Icon } from '@/components/ui/icon';
import { achievementIcon } from '@/lib/achievement-icons';
import { playFanfare } from '@/lib/client/sound';
import { fmt, m } from '@/lib/i18n';
import type { AchievementDto } from '@/lib/types';

interface AchievementToastProps {
  achievements: AchievementDto[];
  onDismiss?: () => void;
}

/** How long one award stays before auto-hide — enough to read title and caption. */
const TOAST_MS = 4_500;

/**
 * Game-style achievement toast. Multiple achievements
 * are queued and shown one at a time — stacked panels are unreadable.
 *
 * Deliberately uses `.pixel-panel` instead of 8bitcn `Card`: Card applies the
 * same className to both wrapper and inner card (its `flex-col` would fight the
 * icon–text–close row layout), and its side borders overflow the box by 6 px,
 * which clips on a `position: fixed` panel at the screen edge. The "new award"
 * chip is still an 8bitcn `Badge`.
 */
export function AchievementToast({ achievements, onDismiss }: AchievementToastProps) {
  const reduced = useReducedMotion();
  const [queue, setQueue] = useState<AchievementDto[]>([]);
  const wasShownRef = useRef(false);

  const codes = achievements.map((item) => item.code).join('|');

  // A new set of achievements replaces the queue entirely.
  useEffect(() => {
    setQueue(achievements.length > 0 ? [...achievements] : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codes]);

  // Auto-hide: the queue head is dropped on a timer, the next one takes its place.
  useEffect(() => {
    if (queue.length === 0) return;
    wasShownRef.current = true;
    const timer = window.setTimeout(() => setQueue((prev) => prev.slice(1)), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [queue]);

  // Fanfare per shown award. A user gesture already happened
  // (finish was clicked), so autoplay is allowed.
  const headCode = queue[0]?.code;
  useEffect(() => {
    if (headCode !== undefined) playFanfare();
  }, [headCode]);

  useEffect(() => {
    if (queue.length === 0 && wasShownRef.current) {
      wasShownRef.current = false;
      onDismiss?.();
    }
  }, [queue, onDismiss]);

  const current = queue[0];
  const rest = Math.max(0, queue.length - 1);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <AnimatePresence mode="wait">
        {current ? (
          <motion.div
            key={current.code}
            role="status"
            className="pixel-panel pixel-panel-accent pointer-events-auto flex w-full max-w-md items-start gap-3 p-3"
            // transform/opacity only.
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: reduced ? 0 : 0.28, ease: 'easeOut' }}
          >
            {/* Each achievement has its own pixel icon. */}
            <Icon name={achievementIcon(current.code)} size={24} className="mt-0.5" />

            <div className="min-w-0 flex-1">
              {/* Label belongs to the identity layer — pixel badge font. */}
              <Badge variant="default" className="mx-1.5 min-h-6 text-[16px]">
                {m.achievementsUi.toastBadge}
              </Badge>
              {/* Title and description are data — regular sans. */}
              <p className="mt-2 truncate font-semibold text-text-main" title={current.title}>
                {current.title}
              </p>
              <p className="text-sm text-text-dim">{current.description}</p>
              {rest > 0 ? <p className="mt-1 text-xs text-text-dim">{fmt(m.achievementsUi.toastMore, { count: rest })}</p> : null}
            </div>

            <button
              type="button"
              aria-label={m.achievementsUi.toastCloseAria}
              onClick={() => setQueue((prev) => prev.slice(1))}
              className="min-h-11 min-w-11 shrink-0 text-text-dim hover:text-text-main"
            >
              <span aria-hidden="true" className="font-pixel text-[16px]">
                ✕
              </span>
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
