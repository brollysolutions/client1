import Link from "next/link";
import { Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { AdminPendingItem } from "@/lib/admin-api";

export const REVIEW_KIND_LABEL: Record<AdminPendingItem["kind"], string> = {
  agent_application: "Agent application",
  banner: "Banner",
  property_submission: "Property listing",
};

const REVIEW_KIND_HREF: Record<AdminPendingItem["kind"], string> = {
  agent_application: "/dashboard/agents",
  banner: "/dashboard/banners",
  property_submission: "/dashboard/property-review",
};

export const REVIEW_LINE_LABEL: Record<AdminPendingItem["business_line"], string> = {
  loans: "Loans",
  real_estate: "Real Estate",
  both: "Both lines",
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function PendingReviewList({
  items,
  emptyMessage,
}: {
  items: AdminPendingItem[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-text-secondary">{emptyMessage}</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={REVIEW_KIND_HREF[item.kind]}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm transition-colors hover:border-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          >
            <span className="flex min-w-0 items-center gap-2 font-medium text-text-primary">
              <Clock className="h-4 w-4 shrink-0 text-brand-cta" aria-hidden="true" />
              <span className="truncate">{item.title}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-text-secondary">
              <Badge variant="outline">{REVIEW_KIND_LABEL[item.kind]}</Badge>
              {REVIEW_LINE_LABEL[item.business_line]}
              {formatDate(item.submitted_at)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
