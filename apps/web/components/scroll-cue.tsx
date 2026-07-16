import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

// Animated "scroll for more" affordance pinned to the bottom of a hero section,
// so a viewport-filling hero signals that the page continues below. Decorative
// (aria-hidden) — the hero content is the real message. Desktop-only (lg+) per
// the site's decoration rule; the bob is disabled under prefers-reduced-motion
// (see .scroll-cue-bob in globals.css). Requires a `relative` hero section.
export function ScrollCue({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-5 z-10 hidden flex-col items-center gap-1 lg:flex",
        className,
      )}
    >
      <span className="text-[0.7rem] font-medium uppercase tracking-wide text-text-secondary">
        Scroll
      </span>
      <span className="scroll-cue-bob text-[var(--nav-primary)]">
        <ChevronDown className="h-5 w-5" />
      </span>
    </div>
  );
}
