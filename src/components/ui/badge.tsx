import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default:
          "border border-border bg-elevated text-muted-foreground",
        success:
          "bg-success/15 text-success border border-success/30",
        destructive:
          "bg-destructive/15 text-destructive border border-destructive/30",
        warning:
          "bg-warning/15 text-warning border border-warning/30",
        running:
          "bg-accent/15 text-accent border border-accent/30",
        queued:
          "bg-muted/20 text-muted-foreground border border-border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
