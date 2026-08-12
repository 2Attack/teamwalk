/*
  Правка относительно версии из реестра 8bitcn: она написана под shadcn на Radix,
  а в проекте стиль `base-nova` — примитивы на Base UI (см. components.json).
  Отсюда два отличия: тип берётся у самого `PopoverContent` вместо
  `@radix-ui/react-popover`, а `PopoverAnchor` снят — в Base UI его нет.

  Осторожно: `npx shadcn add @8bitcn/popover` перезаписывает файл и возвращает
  и то, и другое — после установки правку нужно повторить.
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
