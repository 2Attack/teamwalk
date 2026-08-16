/*
  Patched vs the 8bitcn registry version, which targets shadcn on Radix; this
  project uses the `base-nova` style — Base UI primitives (see components.json).
  Two differences: the type comes from `PopoverContent` itself instead of
  `@radix-ui/react-popover`, and `PopoverAnchor` is removed — Base UI has none.

  Careful: `npx shadcn add @8bitcn/popover` overwrites this file and brings
  both back — reapply the patch after installing.
*/
import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

import {
  Popover as ShadcnPopover,
  PopoverContent as ShadcnPopoverContent,
  PopoverTrigger as ShadcnPopoverTrigger,
} from "@/components/ui/popover";

import "@/components/ui/8bit/styles/retro.css";

const Popover = ShadcnPopover;

const PopoverTrigger = ShadcnPopoverTrigger;

export const popOverVariants = cva("", {
  variants: {
    font: {
      normal: "",
      retro: "retro",
    },
  },
  defaultVariants: {
    font: "retro",
  },
});

export interface BitPopoverProps
  extends React.ComponentProps<typeof ShadcnPopoverContent>,
    VariantProps<typeof popOverVariants> {}

function PopoverContent({
  children,
  font,
  className,
  ...props
}: BitPopoverProps) {
  return (
    <ShadcnPopoverContent
      className={cn(
        "relative bg-card border-y-6 border-foreground dark:border-ring rounded-none mt-1",
        font !== "normal" && "retro",
        className
      )}
      {...props}
    >
      {children}

      <div
        className="absolute inset-0 border-x-6 -mx-1.5 border-foreground dark:border-ring pointer-events-none"
        aria-hidden="true"
      />
    </ShadcnPopoverContent>
  );
}

export { Popover, PopoverTrigger, PopoverContent };
