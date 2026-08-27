"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
// Namespace React import (matching lead-dialog.tsx / hero-carousel.tsx) so the
// classic JSX transform used by the vitest setup can render this in tests.
import * as React from "react";

import { CLOSE_BUTTON_CLASS } from "@/components/ui/close-button";
import { useDebounce } from "@/hooks/use-debounce";
import type { CatalogueFacets } from "@/lib/financial-catalog";
import {
  CATALOGUE_CATEGORIES,
  CATEGORY_PILL_LABEL,
  catalogueHref,
  type CatalogueCategory,
} from "@/lib/financial-catalogue-url";
import { cn } from "@/lib/utils";

// Sticky discovery bar for the public Financial Services catalogue.
//
// Filtering stays server-driven: /loans reads `q` and `category` from
// searchParams and re-fetches the catalogue API, so the URL remains the single
// source of truth (deep links, pagination, and SEO all keep working). This
// island owns only the input's local text plus the debounce, which is what
// lets the results update as you type instead of behind a submit button.
//
// Progressive enhancement: the wrapper is a real GET form and the category
// pills are real links, so filtering still works with JS disabled. Because the
// form has exactly one text field and no submit button, Enter still performs
// the browser's implicit submission.
const DEBOUNCE_MS = 300;

const PILL_BASE =
  "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nav-bg)] motion-reduce:transition-none";

/** Focus shortcut. Matches the "/" convention used by developer tooling and
 *  is ignored while the reader is typing anywhere else on the page. */
const FOCUS_KEY = "/";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

export function FinancialServicesFilters({
  q,
  category,
  total,
  facets,
  filtered,
}: {
  q?: string;
  category?: CatalogueCategory;
  total: number;
  /** Per-category counts for the pills, already narrowed by `q`. */
  facets: CatalogueFacets;
  /** True when `q` or `category` is set, so the count can say "matches"
   *  instead of overstating the published total. */
  filtered: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const serverQuery = q ?? "";
  const [text, setText] = React.useState(serverQuery);
  const debounced = useDebounce(text, DEBOUNCE_MS);
  // Mirrors the query the URL is already known to carry. Without it, a
  // navigation this component did not initiate (back/forward, a category
  // pill, the empty state's clear link) would be immediately undone by the
  // still-pending debounce from the previous keystroke.
  const appliedRef = React.useRef(serverQuery);

  const navigate = React.useCallback(
    (href: string) => {
      // scroll: false keeps the sticky bar and the results the reader is
      // already looking at exactly where they are while the server re-renders.
      startTransition(() => router.replace(href, { scroll: false }));
    },
    [router],
  );

  React.useEffect(() => {
    if (serverQuery === appliedRef.current) return;
    appliedRef.current = serverQuery;
    setText(serverQuery);
  }, [serverQuery]);

  React.useEffect(() => {
    const next = debounced.trim();
    if (next === appliedRef.current) return;
    appliedRef.current = next;
    navigate(catalogueHref({ q: next || undefined, category }));
  }, [debounced, category, navigate]);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== FOCUS_KEY) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function apply(next: string) {
    const trimmed = next.trim();
    if (trimmed === appliedRef.current) return;
    appliedRef.current = trimmed;
    navigate(catalogueHref({ q: trimmed || undefined, category }));
  }

  function clearSearch() {
    setText("");
    apply("");
    inputRef.current?.focus();
  }

  function selectCategory(
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) {
    // Let the browser handle modified clicks (new tab/window) natively.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  }

  const countLabel = filtered
    ? `${total} match${total === 1 ? "" : "es"}`
    : `${total} service${total === 1 ? "" : "s"}`;

  return (
    <form
      action="/loans"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        apply(text);
      }}
      // A blue-tinted glass rail rather than a white panel: it reads as its own
      // surface against the beige section while staying see-through, and the
      // downward shadow keeps results from appearing to touch it once stuck.
      className="sticky top-16 z-30 mt-8 border-y border-brand-blue/10 bg-gradient-to-b from-[var(--nav-tint)]/85 via-[var(--nav-tint)]/45 to-[var(--nav-bg)]/85 shadow-[0_14px_28px_-24px_rgba(41,54,129,0.55)] backdrop-blur-xl sm:mt-10"
    >
      {/* Preserves the active category when the form falls back to a plain
          GET submission (no JS). With JS, onSubmit takes over first. */}
      <input type="hidden" name="category" value={category ?? ""} />

      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:gap-6 lg:px-8">
        <div className="group/search relative lg:w-[25rem] lg:shrink-0">
          <span
            aria-hidden
            className="pointer-events-none absolute left-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-brand-blue/12 text-brand-blue transition-colors duration-200 group-focus-within/search:bg-brand-blue group-focus-within/search:text-surface motion-reduce:transition-none"
          >
            <Search className="h-4 w-4" />
          </span>
          <input
            ref={inputRef}
            type="search"
            name="q"
            value={text}
            maxLength={100}
            onChange={(event) => setText(event.target.value)}
            aria-label="Search financial services"
            aria-keyshortcuts={FOCUS_KEY}
            placeholder="Search personal loan, insurance, cards..."
            className="h-11 w-full rounded-full bg-surface/45 pl-[3.25rem] pr-12 text-sm text-foreground ring-1 ring-inset ring-brand-blue/20 transition-[box-shadow,background-color] placeholder:text-text-secondary hover:bg-surface/65 hover:ring-brand-blue/35 focus:outline-none focus-visible:bg-surface/90 focus-visible:shadow-[0_0_0_4px_rgba(2,132,199,0.14)] focus-visible:ring-2 focus-visible:ring-brand-blue motion-reduce:transition-none lg:h-12 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {text ? (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className={cn("absolute right-2 top-1/2 -translate-y-1/2", CLOSE_BUTTON_CLASS)}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <kbd
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 hidden h-6 min-w-6 -translate-y-1/2 items-center justify-center rounded-md bg-surface/70 px-1.5 font-geist text-xs font-medium text-text-secondary ring-1 ring-inset ring-brand-blue/15 group-focus-within/search:opacity-0 lg:inline-flex"
            >
              {FOCUS_KEY}
            </kbd>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-3 lg:flex-1">
          <div
            role="group"
            aria-label="Filter by category"
            // Below lg the row scrolls; the mask fades the overflowing pill out
            // instead of slicing it mid-word at the container edge.
            className="-mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 py-1 [mask-image:linear-gradient(to_right,#000_calc(100%_-_2rem),transparent)] [scrollbar-width:none] lg:[mask-image:none] [&::-webkit-scrollbar]:hidden"
          >
            {[undefined, ...CATALOGUE_CATEGORIES].map((value) => {
              const active = category === value;
              const href = catalogueHref({ q, category: value });
              const count = value ? facets[value] : facets.all;
              // A pill that would return nothing under the current query stays
              // visible (the count is the useful signal) but stops being a
              // route into a dead empty state.
              const empty = count === 0 && !active;
              return (
                <Link
                  key={value ?? "all"}
                  href={href}
                  scroll={false}
                  onClick={(event) => {
                    if (empty) {
                      event.preventDefault();
                      return;
                    }
                    selectCategory(event, href);
                  }}
                  aria-current={active ? "true" : undefined}
                  aria-disabled={empty ? "true" : undefined}
                  className={cn(
                    PILL_BASE,
                    active
                      ? "bg-brand-blue text-surface shadow-[0_6px_14px_-6px_rgba(2,132,199,0.75)]"
                      : "bg-surface/50 text-text-secondary ring-1 ring-inset ring-brand-blue/15",
                    !active &&
                      !empty &&
                      "hover:bg-surface/80 hover:text-brand-blue hover:ring-brand-blue/40",
                    empty && "cursor-default opacity-45",
                  )}
                >
                  {value ? CATEGORY_PILL_LABEL[value] : "All services"}
                  <span
                    className={cn(
                      "tabular-nums text-xs font-semibold",
                      active ? "text-surface/75" : "text-text-secondary/70",
                    )}
                  >
                    {count}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* The pills already carry per-category counts, so the aggregate
              total is not shown visually. The live region stays in the tree
              at every width so assistive tech still hears the result change. */}
          <p aria-live="polite" className="sr-only">
            {countLabel}
          </p>
        </div>
      </div>

      {/* Progress hairline. The results are re-rendered by the server, so this
          is the only signal that a keystroke or pill is in flight. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 bottom-0 h-0.5 origin-left bg-brand-blue transition-transform duration-300 motion-reduce:transition-none",
          pending ? "scale-x-100" : "scale-x-0",
        )}
      />
    </form>
  );
}
