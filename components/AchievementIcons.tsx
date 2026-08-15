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
  /** Каталог с отметкой полученных: показываются только `earnedAt !== null`. */
  achievements: AchievementDto[];
  className?: string;
}

/**
 * Ряд полученных ачивок пиксельными иконками (п. 6.8.3) — в карточке игрока.
 * Наведение или фокус раскрывает `Tooltip` из 8bitcn с названием и условием;
 * для скринридера то же самое лежит в aria-label триггера, поэтому тултип
 * можно не открывать. Триггер — кнопка ≥44 px: на планшете тултип открывают
 * тапом, промахиваться по значку 16 px было бы мучением.
 */
export function AchievementIcons({ achievements, className }: AchievementIconsProps) {
  const earned = achievements.filter((item) => item.earnedAt !== null);
  if (earned.length === 0) return null;

  return (
    <TooltipProvider>
      <ul
        aria-label={m.achievementsUi.rowAria}
        // Отрицательные поля гасят припуски тач-зоны (44 px вокруг иконки
        // 16 px), чтобы ряд не раздувал шапку карточки по вертикали.
        className={cn('-my-3 -ml-3 flex flex-wrap items-center', className)}
      >
        {earned.map((item) => (
          <li key={item.code}>
            <Tooltip>
              {/* Триггер Base UI сам рендерит <button> — свой не нужен. */}
              <TooltipTrigger
                aria-label={fmt(m.achievementsUi.tooltipAria, { title: item.title, description: item.description })}
                className="flex min-h-11 min-w-11 items-center justify-center text-citrus focus-visible:outline-2 focus-visible:outline-citrus"
              >
                <Icon name={achievementIcon(item.code)} size={16} />
              </TooltipTrigger>
              {/* Название — метка, пиксель; условие читают — sans (п. 6.7.1).
                  flex-col: заголовок над описанием, а не в строку — базовый
                  Popup раскладывает детей горизонтально. */}
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
