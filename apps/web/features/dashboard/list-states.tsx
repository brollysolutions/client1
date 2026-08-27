"use client";

import type { ReactNode } from "react";
import { Loader2, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LIST_PAGE_SIZE } from "@/features/dashboard/use-filtered-page";
import { cn } from "@/lib/utils";

/**
 * The empty and loading states every staff list needs.
 *
 * These three shapes were copy-pasted into roughly twenty views with small
 * drifts each time (`py-16` vs `p-12`, `rounded-2xl` vs `rounded-xl`, an icon in
 * a tinted square in some places and bare in others). The error state is not
 * here on purpose — `features/dashboard/fetch-error.tsx` already owns it and
 * maps HTTP status to the right copy.
 */
export function ListEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center",
        className,
      )}
    >
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-text-secondary">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="mt-5 text-lg font-semibold text-text-primary">{title}</h2>
      {description ? (
        <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/**
 * Skeleton rows for a table that is loading. Preferred over a lone spinner: it
 * holds the layout, so the page does not jump when the rows land.
 */
export function ListLoadingState({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-12 rounded-lg" />
      ))}
    </div>
  );
}

/** Centred spinner for panels too small to justify skeleton rows. */
export function ListSpinner({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center py-12", className)} aria-busy="true">
      <Loader2 className="h-6 w-6 animate-spin text-brand-cta" aria-hidden="true" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

/**
 * Prev/Next with a range readout. Pairs with `useFilteredPage`; `total` is the
 * filtered length, not the fetched length, so the readout matches what the user
 * can actually page through.
 */
export function ListPagination({
  page,
  total,
  onPageChange,
  pageSize = LIST_PAGE_SIZE,
}: {
  page: number;
  total: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
}) {
  if (total <= pageSize) return null;

  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
      <p className="text-xs text-text-secondary">
        Showing {start}-{end} of {total}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={end >= total} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
