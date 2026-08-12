import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

import { Input as ShadcnInput } from "@/components/ui/input";

import "@/components/ui/8bit/styles/retro.css";

export const inputVariants = cva("", {
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

export interface BitInputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {
  asChild?: boolean;
}

function Input({ ...props }: BitInputProps) {
  const { className, font } = props;

  return (
    <div
      className={cn(
        "relative border-y-6 border-foreground dark:border-ring !p-0 flex items-center",
        className
      )}
    >
      <ShadcnInput
        {...props}
        className={cn(
          "rounded-none ring-0 !w-full",
          font !== "normal" && "retro",
          className
        )}
      />

      {/*
        Боковые грани рисуются внутри габаритов поля, без `-mx-1.5`. С выносом
        наружу рамка переставала быть прямоугольником: верх и низ — настоящие
        бордеры обёртки (`border-y-6`, внутри box), а бока уезжали на 6px за её
        край. В модалке это читалось как «поле шире остального содержимого», и
        вдобавок подрезалось: у `DialogBody` стоит `overflow-y-auto`, а он по
        спецификации превращает `overflow-x: visible` в `auto`.
      */}
      <div
        className="absolute inset-0 border-x-6 border-foreground dark:border-ring pointer-events-none"
        aria-hidden="true"
      />
    </div>
  );
}

export { Input };
