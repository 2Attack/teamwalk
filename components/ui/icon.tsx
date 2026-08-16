/**
 * Pixel icon from the pixelarticons set (spec § 6.7.4: one set, no icon fonts —
 * mismatched stroke widths show immediately). Path data lives in
 * `lib/icons.generated.ts`, refreshed via `npm run gen:icons`.
 *
 * Rendered as inline <svg>, not <img>: only inline SVG supports `currentColor`.
 * With <img> the color resolves to black regardless of context — invisible on
 * the app's dark background, muddy on the citrus button.
 *
 * The <span> wrapper is not cosmetic: shadcn/8bitcn base classes target direct
 * <svg> children (`[&>svg]:size-3!` on Badge, `*:[svg]:row-span-2` on Alert)
 * and would rewrite size and layout. Via span the icon stays a plain
 * inline-block box.
 *
 * Always decorative: `aria-hidden`. The adjacent button or row must make sense
 * without the icon; otherwise duplicate it with text.
 */
import type * as React from 'react';

import { cn } from '@/lib/cn';
import { ICON_PATHS, ICON_VIEWBOX, type IconName } from '@/lib/icons.generated';

export type { IconName };

export interface IconProps {
  name: IconName;
  /** Sizes in multiples of 8 keep the pixel grid crisp. */
  size?: number;
  className?: string;
}

export function Icon({ name, size = 16, className }: IconProps): React.JSX.Element {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn('inline-block shrink-0 select-none', className)}
    >
      <svg
        viewBox={ICON_VIEWBOX}
        width={size}
        height={size}
        fill="currentColor"
        /* A 24×24 grid at 16 px yields fractional edges — without this they blur. */
        shapeRendering="crispEdges"
        focusable="false"
        className="block h-full w-full"
      >
        {ICON_PATHS[name].map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </span>
  );
}
