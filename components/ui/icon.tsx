/**
 * Пиксельная иконка из набора pixelarticons (п. 6.7.4: один набор, без иконочных
 * шрифтов — разная толщина штриха видна сразу). Данные путей — в
 * `lib/icons.generated.ts`, обновляются через `npm run gen:icons`.
 *
 * Рендерится инлайновым <svg>, а не <img>: только так работает `currentColor`.
 * У <img> цвет разрешается в чёрный независимо от окружения, и на тёмном фоне
 * приложения иконки становились невидимыми, а на цитрусовой кнопке — грязными.
 *
 * Обёртка <span> не косметическая: базовые классы shadcn/8bitcn ловят прямых
 * потомков-<svg> (`[&>svg]:size-3!` у Badge, `*:[svg]:row-span-2` у Alert) и
 * переписали бы размер и раскладку. Через span иконка остаётся обычным
 * inline-block-боксом — ровно как раньше с <img>.
 *
 * Всегда декоративна: `aria-hidden`. Смысл рядом стоящей кнопки или строки
 * должен читаться и без иконки, иначе её нужно дублировать текстом.
 */
import type * as React from 'react';

import { cn } from '@/lib/cn';
import { ICON_PATHS, ICON_VIEWBOX, type IconName } from '@/lib/icons.generated';

export type { IconName };

export interface IconProps {
  name: IconName;
  /** Кратные 8 размеры сохраняют пиксельную сетку чёткой. */
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
        /* Сетка 24×24 при 16 px даёт дробные границы — без этого края мылятся. */
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
