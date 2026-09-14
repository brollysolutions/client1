import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** One loading announcement for a group of decorative placeholders. */
export function LoadingRegion({ children, className, label = "Loading page" }: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className={cn("min-w-0", className)}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
