import * as React from "react";
import Link from "next/link";

import { SITE_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      prefetch={false}
      aria-label={`${SITE_NAME} home`}
      className={cn(
        "flex items-center gap-2 rounded-sm font-heading text-lg font-semibold text-[var(--nav-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nav-bg)]",
        className
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--nav-primary)] text-sm font-bold text-white">
        D
      </span>
      <span className="hidden sm:inline">{SITE_NAME}</span>
    </Link>
  );
}
