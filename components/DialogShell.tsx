'use client';

/**
 * Shared dialog shell.
 *
 * The four project dialogs used to configure `DialogContent` each in their own
 * way: two showed the stock close cross, two hid it; one went without
 * `sm:max-w-md` and was narrower than the rest; the action row was hand-built
 * in two places and used `DialogFooter` in the other two. These decisions are
 * made once here so the dialogs do not drift apart again.
 */
import type * as React from 'react';

import { DialogContent } from '@/components/ui/8bit/dialog';
import { cn } from '@/lib/cn';

type DialogShellProps = React.ComponentProps<typeof DialogContent>;

export function DialogShell({ className, children, ...props }: DialogShellProps) {
  return (
    <DialogContent
      /*
        `font="normal"`: only the title (it has its own `font-heading`) and
        button labels stay pixel inside a dialog — everything else is read
.
      */
      font="normal"
      className={cn(
        'gap-5 sm:max-w-md',
        /*
          The height cap is not cosmetic. The popup is positioned `fixed` at the
          center and used to have neither `max-height` nor scrolling: the
          662px-tall avatar picker dialog on a 500×523 screen was cropped by
          70px top and bottom, the title went off-screen and the "Create"
          button became unreachable — creating a participant from a phone was
          impossible. `flex-col` is required so `DialogBody` inside takes the
          remaining height and scrolls itself, keeping the header and buttons
          in place.
        */
        'flex max-h-[calc(100dvh-2rem)] flex-col',
        /*
          The stock shadcn close cross is drawn with a lucide icon, while the
          project uses pixel icons only. Hidden in all dialogs at
          once: closing works via Esc, a click outside, and the explicit cancel
          button every dialog has.
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
 * Scrollable middle of a dialog: the header and the action row stay in place.
 * `min-h-0` is mandatory — without it the flex item refuses to shrink and
 * scrolling never kicks in.
 *
 * `px-1.5` reserves room for the 8bit input "ears": its side edges overhang
 * the field by 6px (`-mx-1.5` in `ui/8bit/input.tsx`), and `overflow-y-auto`
 * would clip that overhang (per spec it turns `overflow-x: visible` into
 * `auto`). With the padding the ears land inside the box and stay visible.
 */
export function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-1.5', className)} {...props} />;
}
