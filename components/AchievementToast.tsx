'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/8bit/badge';
import { Icon } from '@/components/ui/icon';
import { achievementIcon } from '@/lib/achievement-icons';
import { playFanfare } from '@/lib/client/sound';
import type { AchievementDto } from '@/lib/types';

interface AchievementToastProps {
  achievements: AchievementDto[];
  onDismiss?: () => void;
}

/** Сколько держится одна награда до автоскрытия. Хватает прочитать заголовок и подпись. */
const TOAST_MS = 4_500;

/**
 * Уведомление о награде в игровой стилистике (п. 6.7.5, 6.8.3).
 * Несколько достижений сразу показываются очередью, по одному: три панели,
 * наехавшие друг на друга, не читаются ни глазом, ни скринридером.
 *
 * Панель осознанно осталась на `.pixel-panel`, а не на `Card` из 8bitcn:
 * Card кладёт один и тот же className и на внешнюю обёртку, и на внутреннюю
 * карточку (её `flex-col` пришлось бы перебивать ради строчной раскладки
 * «иконка — текст — крестик»), а её боковые рамки вылезают на 6 px за габарит,
 * что для `position: fixed` панели у края экрана означает обрезку. Плашка
 * «Новая награда» при этом — `Badge` из 8bitcn.
 */
export function AchievementToast({ achievements, onDismiss }: AchievementToastProps) {
  const reduced = useReducedMotion();
  const [queue, setQueue] = useState<AchievementDto[]>([]);
  const wasShownRef = useRef(false);

  const codes = achievements.map((item) => item.code).join('|');

  // Новый набор достижений полностью заменяет очередь.
  useEffect(() => {
    setQueue(achievements.length > 0 ? [...achievements] : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codes]);

  // Автоскрытие: голова очереди снимается по таймеру, следующая берёт её место.
  useEffect(() => {
    if (queue.length === 0) return;
    wasShownRef.current = true;
    const timer = window.setTimeout(() => setQueue((prev) => prev.slice(1)), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [queue]);

  // Фанфара на каждую показанную награду (п. 6.8.3): очередь двигается —
  // звучит новая. Жест уже был (финиш нажимали руками), автоплей разрешён.
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
            // Только transform и opacity (п. 6.7.6).
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: reduced ? 0 : 0.28, ease: 'easeOut' }}
          >
            {/* У каждой ачивки своя пиксельная иконка (п. 6.8.3). */}
            <Icon name={achievementIcon(current.code)} size={24} className="mt-0.5" />

            <div className="min-w-0 flex-1">
              {/* Метка — слой идентичности, поэтому пиксельный шрифт бейджа (п. 6.7.1). */}
              <Badge variant="default" className="mx-1.5 min-h-6 text-[16px]">
                Новая награда
              </Badge>
              {/* Название и описание — данные, значит обычный sans. */}
              <p className="mt-2 truncate font-semibold text-text-main" title={current.title}>
                {current.title}
              </p>
              <p className="text-sm text-text-dim">{current.description}</p>
              {rest > 0 ? <p className="mt-1 text-xs text-text-dim">Ещё наград: {rest}</p> : null}
            </div>

            <button
              type="button"
              aria-label="Закрыть уведомление"
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
