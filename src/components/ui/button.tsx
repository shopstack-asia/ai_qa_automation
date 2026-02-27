import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-input text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "h-11 min-h-[2.75rem] bg-gradient-to-r from-accent to-indigo text-white shadow-md hover:brightness-110 hover:shadow-lg active:scale-[0.98]",
        secondary:
          "h-11 min-h-[2.75rem] border border-[rgba(255,255,255,0.1)] bg-surface text-foreground hover:bg-elevated hover:border-[rgba(255,255,255,0.12)]",
        danger:
          "h-11 min-h-[2.75rem] bg-destructive text-white hover:bg-destructive/90 active:scale-[0.98]",
        ghost:
          "h-11 min-h-[2.75rem] text-muted-foreground hover:bg-elevated hover:text-foreground",
      },
      size: {
        default: "px-5",
        sm: "h-9 min-h-[2.25rem] px-3 text-xs",
        lg: "h-12 min-h-[3rem] px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
