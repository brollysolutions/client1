
import * as React from "react";
import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("max-w-full animate-pulse rounded-md bg-brand-sky/30 motion-reduce:animate-none", className)}
      {...props}
    />
  )
}

export { Skeleton }
