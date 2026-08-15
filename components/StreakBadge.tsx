'use client';

import { Badge } from '@/components/ui/8bit/badge';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { m, plural } from '@/lib/i18n';

interface StreakBadgeProps {
  days: number;
  className?: string;
}

/** "Hot" streak threshold (spec § 6.8.2): 5+ consecutive work days get their own highlight. */
const HOT_STREAK_DAYS = 5;

/**
 * Streak badge next to the name (spec § 6.8.2) — 8bitcn `Badge`.
 *
 * State maps to library variants, not custom colors: `default` — citrus fill
 * for a "hot" streak, `secondary` — normal, `outline` — zero. A zero streak
 * dims rather than disappears: an empty cell reads as a loading error, a muted
 * zero reads as a fact.
 *
 * `font` stays pixel (library default): only an icon and a number inside —
 * identity layer, not data (spec § 6.7.1).
 */
export function StreakBadge({ days, className }: StreakBadgeProps) {
  const safeDays = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;
  const isHot = safeDays >= HOT_STREAK_DAYS;

  const label = safeDays === 0 ? m.streak.none : plural(m.streak.label, safeDays);

  return (
    <Badge
      role="img"
      aria-label={label}
      title={label}
      variant={isHot ? 'default' : safeDays === 0 ? 'outline' : 'secondary'}
      /*
        8bitcn Badge splits className itself: `text-*`/`bg-*`/`border-*` go to
        the chip and side pixel bars, everything else to the container. So size
        goes on the container (`min-h-7`), font size via a visual class;
        `mx-1.5` leaves room for the side bars.
      */
      className={cn('mx-1.5 min-h-7 align-middle', 'text-[16px]', className)}
    >
      {/* Icon from the shared pixel set (spec § 6.7.4); meaning is carried by aria-label. */}
      <Icon name="flame" size={16} />
      <span className="tabular-nums">{safeDays}</span>
    </Badge>
  );
}
