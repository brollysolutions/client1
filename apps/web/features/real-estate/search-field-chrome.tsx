import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

// Shared visual chrome for every property search field in the real-estate
// dashboard: Home's quick-search hand-off and PropertySearchBar's omnibox
// (Explore, category pages, Bookmarks -- everywhere PropertyBrowser renders
// it). Each place keeps its own input logic (Home: a plain debounce-less
// field; PropertySearchBar: a Command popover with suggestions), but they
// share one container, one icon treatment, and one set of animations so the
// "property search bar" reads as a single, consistent product wherever it
// appears.
//
// The focus glow/lift are plain CSS transitions (no keyframes needed). The
// moving sheen while focused lives in globals.css as `.search-field-shell`
// because it animates `background-position`, which Tailwind has no utility
// for; that class carries the field's own background color too, so it must
// not be paired with a `bg-*` utility on the same element.
export const SEARCH_FIELD_SHELL_CLASS =
  "search-field-shell group/search relative flex h-14 items-center gap-1 rounded-xl border border-border pl-1 shadow-sm transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md focus-within:-translate-y-0.5 focus-within:border-brand-cta focus-within:shadow-[0_0_0_4px_rgba(2,132,199,0.16),0_10px_28px_-14px_rgba(2,132,199,0.55)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:focus-within:translate-y-0";

// One-shot press feedback for the field's own "Search" button. Applied
// alongside each call site's own sizing/position classes via `cn()`.
export const SEARCH_FIELD_BUTTON_MOTION_CLASS =
  "transition-transform duration-150 ease-out hover:shadow-md active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100";

// Shared clear ("x") button treatment, including a pop-in for the moment it
// mounts (it only exists in the DOM while there is text to clear).
export const SEARCH_FIELD_CLEAR_BUTTON_CLASS =
  "flex h-11 w-11 shrink-0 cursor-pointer animate-in items-center justify-center rounded-lg text-text-secondary fade-in-0 zoom-in-90 duration-200 transition-colors hover:bg-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cta/40 motion-reduce:animate-none";

// Leading icon badge: a quiet tinted circle at rest that fills solid and
// gives the glass a small pop the moment the field takes focus, so the whole
// control feels responsive rather than just a static box with a ring.
export function SearchFieldIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-cta-tint text-brand-cta transition-all duration-300 ease-out group-focus-within/search:scale-110 group-focus-within/search:rotate-6 group-focus-within/search:bg-brand-cta group-focus-within/search:text-white motion-reduce:transition-none motion-reduce:group-focus-within/search:scale-100 motion-reduce:group-focus-within/search:rotate-0",
        className,
      )}
    >
      <Search className="h-4 w-4" />
    </span>
  );
}
