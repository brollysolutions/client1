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
  consumeCatalogueScroll,
  persistCatalogueScroll,
  scheduleCatalogueNavigationFallback,
} from "@/lib/financial-catalogue-navigation";
import {
  CATALOGUE_CATEGORIES,
  CATALOGUE_ANCHOR,
  CATEGORY_PILL_LABEL,
  catalogueHref,
  type CatalogueCategory,
} from "@/lib/financial-catalogue-url";
import { cn } from "@/lib/utils";

// Sticky discovery bar for the public Financial Services catalogue.
//
// Filtering stays server-driven: /loans reads `q` and `category` from
// searchParams and filters the service directory with published metadata, so the URL remains the single
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
  "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-3.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-reduce:transition-none";

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
   *  instead of announcing the unfiltered directory total. */
  filtered: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const recoveryTimerRef = React.useRef<number | null>(null);
  const recoveryHrefRef = React.useRef<string | null>(null);
  const [interactive, setInteractive] = React.useState(false);

  const serverQuery = q ?? "";
  const [text, setText] = React.useState(serverQuery);
  const debounced = useDebounce(text, DEBOUNCE_MS);
  // Mirrors the query the URL is already known to carry. Without it, a
  // navigation this component did not initiate (back/forward, a category
  // pill, the empty state's clear link) would be immediately undone by the
  // still-pending debounce from the previous keystroke.
  const appliedRef = React.useRef(serverQuery);

  // Playwright and a fast real user can reach useful server-rendered markup
  // before React owns its controlled value. Keep the JS control inert until a
  // client commit completes.
  React.useEffect(() => setInteractive(true), []);

  React.useEffect(() => {
    const scrollY = consumeCatalogueScroll(window.sessionStorage);
    const target = document.getElementById(window.location.hash.slice(1));
    // App Router can consume a cross-page hash while the route skeleton is
    // mounted. Finish that jump once the actual service cards have streamed.
    if (target?.closest(`#${CATALOGUE_ANCHOR}`)) {
      const frame = window.requestAnimationFrame(() => target.scrollIntoView({ block: "start", behavior: "instant" }));
      return () => window.cancelAnimationFrame(frame);
    }
    if (scrollY === null) return;
    const frame = window.requestAnimationFrame(() => window.scrollTo({ top: scrollY }));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const cancelRecovery = React.useCallback(() => {
    if (recoveryTimerRef.current === null) return;
    window.clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = null;
  }, []);

  const navigate = React.useCallback(
    (href: string) => {
      // scroll: false keeps the sticky bar and the results the reader is
      // already looking at exactly where they are while the server re-renders.
      cancelRecovery();
      recoveryHrefRef.current = href;
      startTransition(() => router.replace(href, { scroll: false }));
      recoveryTimerRef.current = scheduleCatalogueNavigationFallback(href, {
        currentHref: () => `${window.location.pathname}${window.location.search}`,
        currentScrollY: () => window.scrollY,
        persistScroll: (scrollY) => persistCatalogueScroll(window.sessionStorage, scrollY),
        replaceLocation: (destination) => window.location.replace(destination),
        schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
      });
    },
    [cancelRecovery, router],
  );

  React.useEffect(() => {
    const currentHref = `${window.location.pathname}${window.location.search}`;
    if (recoveryHrefRef.current !== currentHref) return;
    cancelRecovery();
    recoveryHrefRef.current = null;
  }, [serverQuery, category, cancelRecovery]);

  React.useEffect(() => cancelRecovery, [cancelRecovery]);

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
    if (!interactive) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== FOCUS_KEY) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [interactive]);

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
      aria-busy={!interactive || pending}
      onSubmit={(event) => {
        event.preventDefault();
        apply(text);
      }}
      // Solid white chrome keeps search and categories legible over the results.
      className="sticky top-16 z-30 mt-8 border-y border-border bg-surface shadow-sm sm:mt-10"
    >
      {/* Preserves the active category when the form falls back to a plain
          GET submission (no JS). With JS, onSubmit takes over first. */}
      <input type="hidden" name="category" value={category ?? ""} />

      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:gap-6 lg:px-8">
        <div className="group/search relative min-w-0 lg:w-[25rem] lg:shrink-0">
          <span
            aria-hidden
            className="pointer-events-none absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-brand-link"
          >
            <Search className="h-4 w-4" />
          </span>
          <input
            ref={inputRef}
            type="search"
            name="q"
            value={text}
            disabled={!interactive}
            maxLength={100}
            onChange={(event) => setText(event.target.value)}
            aria-label="Search financial services"
            aria-keyshortcuts={FOCUS_KEY}
            placeholder="Search personal loan, insurance, cards..."
            className="h-12 w-full rounded-xl border border-input bg-surface pl-12 pr-12 text-base text-brand-heading shadow-xs transition-[border-color,box-shadow] duration-150 placeholder:text-text-secondary hover:border-brand-blue focus:outline-none focus-visible:border-brand-blue focus-visible:ring-2 focus-visible:ring-ring/30 motion-reduce:transition-none [&::-webkit-search-cancel-button]:appearance-none"
          />
          {text ? (
            <button
              type="button"
              onClick={clearSearch}
              disabled={!interactive}
              aria-label="Clear search"
              className={cn("absolute right-2 top-1/2 -translate-y-1/2", CLOSE_BUTTON_CLASS)}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <kbd
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 hidden h-6 min-w-6 -translate-y-1/2 items-center justify-center rounded-md border border-border bg-surface-sky px-1.5 font-geist text-xs font-medium text-text-secondary group-focus-within/search:opacity-0 lg:inline-flex"
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
                      ? "border-brand-navy bg-brand-navy text-white"
                      : "border-border bg-surface-sky text-brand-heading",
                    !active &&
                      !empty &&
                      "hover:border-brand-blue hover:bg-brand-cta-tint",
                    empty && "cursor-default opacity-45",
                  )}
                >
                  {value ? CATEGORY_PILL_LABEL[value] : "All services"}
                  <span
                    className={cn(
                      "tabular-nums text-xs font-semibold",
                      active ? "text-dash-foreground" : "text-text-secondary",
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
