import Link from "next/link";
import { Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { PendingApprovalItem } from "@/lib/sub-admin-api";

export const PENDING_KIND_LABEL: Record<string, string> = { banner: "Banner", property_submission: "Property listing" };
export const PENDING_LINE_LABEL: Record<string, string> = { loans: "Loans", real_estate: "Real Estate", both: "Both lines" };

function hrefFor(kind: string): string {
  return kind === "banner" ? "/dashboard/banners" : "/dashboard/property-submit";
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function PendingApprovalList({ items, emptyMessage }: { items: PendingApprovalItem[]; emptyMessage: string }) {
  if (items.length === 0) return <p className="text-sm text-text-secondary">{emptyMessage}</p>;
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id}>
          <Link href={hrefFor(item.kind)} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm transition-colors hover:border-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue">
            <span className="flex min-w-0 items-center gap-2 font-medium text-text-primary"><Clock className="h-4 w-4 shrink-0 text-brand-cta" aria-hidden="true" /><span className="truncate">{item.title}</span></span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-text-secondary"><Badge variant="outline">{PENDING_KIND_LABEL[item.kind] ?? item.kind}</Badge>{PENDING_LINE_LABEL[item.business_line] ?? item.business_line}{formatDate(item.submitted_at)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
