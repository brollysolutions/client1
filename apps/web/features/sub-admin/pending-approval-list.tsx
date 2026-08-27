"use client";

import { PendingReviewTable, REVIEW_LINE_LABEL } from "@/features/dashboard/pending-review-table";
import type { PendingApprovalItem } from "@/lib/sub-admin-api";

export const PENDING_LINE_LABEL = REVIEW_LINE_LABEL;

export const PENDING_KIND_LABEL: Record<string, string> = {
  banner: "Banner",
  property_submission: "Property listing",
};

// Where the *author* goes to see the item they submitted — not where the
// reviewer goes to act on it, which is why these differ from the Admin map.
const PENDING_KIND_HREF: Record<string, string> = {
  banner: "/dashboard/banners",
  property_submission: "/dashboard/my-submissions",
};

export function PendingApprovalList({
  items,
  emptyMessage,
}: {
  items: PendingApprovalItem[];
  emptyMessage: string;
}) {
  return (
    <PendingReviewTable
      items={items}
      kindLabel={PENDING_KIND_LABEL}
      kindHref={PENDING_KIND_HREF}
      emptyTitle="Nothing is awaiting approval"
      emptyDescription={emptyMessage}
    />
  );
}
