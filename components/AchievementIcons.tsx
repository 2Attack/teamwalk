'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/8bit/tooltip';
import { Icon } from '@/components/ui/icon';
import { achievementIcon } from '@/lib/achievement-icons';
import { cn } from '@/lib/cn';
import { fmt, m } from '@/lib/i18n';
import type { AchievementDto } from '@/lib/types';

interface AchievementIconsProps {
  /** Full catalog with earned marks: only `earnedAt !== null` are shown. */
  achievements: AchievementDto[];
  className?: string;
}

/**
 * Row of earned achievements as pixel icons, shown on the player card.
 * Hover/focus opens an 8bitcn `Tooltip`; the same text lives in the trigger's
 * aria-label, so screen readers don't need the tooltip. Trigger is a >=44 px
 * button: on tablets the tooltip opens by tap, and a 16 px icon is too small a target.
 */
export function AchievementIcons({ achievements, className }: AchievementIconsProps) {
  const earned = achievements.filter((item) => item.earnedAt !== null);
  if (earned.length === 0) return null;

  return (
    <TooltipProvider>
      <ul
        aria-label={m.achievementsUi.rowAria}
        // Negative margins absorb the touch-target padding (44 px around a
        // 16 px icon) so the row doesn't inflate the card header vertically.
        className={cn('-my-3 -ml-3 flex flex-wrap items-center', className)}
      >
        {earned.map((item) => (
          <li key={item.code}>
            <Tooltip>
              {/* Base UI trigger renders its own <button>. */}
              <TooltipTrigger
                aria-label={fmt(m.achievementsUi.tooltipAria, { title: item.title, description: item.description })}
                className="flex min-h-11 min-w-11 items-center justify-center text-citrus focus-visible:outline-2 focus-visible:outline-citrus"
              >
                <Icon name={achievementIcon(item.code)} size={16} />
              </TooltipTrigger>
              {/* Title is a label (pixel font); description is body text (sans).
                  flex-col needed: the base Popup lays children out horizontally. */}
              <TooltipContent font="normal" className="max-w-64 flex-col items-start">
                <p className="font-pixel text-[10px] leading-relaxed">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed">{item.description}</p>
              </TooltipContent>
            </Tooltip>
          </li>
        ))}
      </ul>
    </TooltipProvider>
  );
}
