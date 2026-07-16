"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

// Animated "scroll for more" affordance pinned to the bottom of a hero section.
// It bobs (see .scroll-cue-bob in globals.css) and fades out the moment the user
// scrolls away from the top, fading back in only when they return to the hero.
// Decorative (aria-hidden); desktop-only (lg+) per the site's decoration rule;
// motion is disabled under prefers-reduced-motion. Requires a `relative` hero.
export function ScrollCue({ className }: { className?: string }) {
  // Visible only while the page is at the top (hero in view). Start true so the
  // cue is present on first paint before the scroll listener runs.
  const [atTop, setAtTop] = useState(true);

  useEffect(() => {
    let ticking = false;
    const update = () => {
      // Any deliberate downward scroll hides it; returning to the top shows it.
      setAtTop(window.scrollY < 40);
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-5 z-10 hidden flex-col items-center gap-1 transition-opacity duration-300 ease-out lg:flex",
        atTop ? "opacity-100" : "opacity-0",
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
