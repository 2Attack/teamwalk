'use client';

/**
 * Общая оболочка модалок (п. 6.8.3).
 *
 * Все четыре модалки проекта раньше настраивали `DialogContent` по-своему: две
 * показывали штатный крестик, две прятали; одна шла без `sm:max-w-md` и поэтому
 * была уже остальных; ряд кнопок в двух местах был собран вручную, а в двух —
 * через `DialogFooter`. Здесь эти решения приняты один раз, чтобы модалки не
 * расходились снова.
 */
import type * as React from 'react';

import { DialogContent } from '@/components/ui/8bit/dialog';
import { cn } from '@/lib/cn';

type DialogShellProps = React.ComponentProps<typeof DialogContent>;

export function DialogShell({ className, children, ...props }: DialogShellProps) {
  return (
    <DialogContent
      /*
        `font="normal"`: пиксельным в модалке остаётся только заголовок (у него
        свой `font-heading`) и метки кнопок — всё остальное здесь читают (п. 6.7.1).
      */
      font="normal"
      className={cn(
        'gap-5 sm:max-w-md',
        /*
          Ограничение по высоте — не косметика. Popup позиционируется `fixed` по
          центру и до этого не имел ни `max-height`, ни прокрутки: модалка выбора
          персонажа высотой 662 px на экране 500×523 обрезалась на 70 px сверху и
          снизу, заголовок уходил за край, а кнопка «Создать» становилась
          недостижимой — создать участника с телефона было нельзя. `flex-col` нужен,
          чтобы `DialogBody` внутри забирал остаток высоты и прокручивался сам,
          оставляя шапку и кнопки на месте.
        */
        'flex max-h-[calc(100dvh-2rem)] flex-col',
        /*
          Штатный крестик shadcn рисуется иконкой lucide, а в проекте только
          пиксельные иконки (п. 6.7.4). Прячем во всех модалках разом: закрытие —
          Esc, клик вне модалки и явная кнопка отмены, которая есть в каждой.
        */
        '[&_[data-slot=dialog-close]]:hidden',
        className,
      )}
      {...props}
    >
      {children}
    </DialogContent>
  );
}

/**
 * Прокручиваемая середина модалки: шапка и ряд кнопок остаются на месте.
 * `min-h-0` обязателен — без него flex-элемент не даёт себя сжать и прокрутка
 * никогда не включается.
 */
export function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto', className)} {...props} />;
}
