"use client";

import { PendingReviewTable, REVIEW_LINE_LABEL } from "@/features/dashboard/pending-review-table";
import type { AdminPendingItem } from "@/lib/admin-api";

export { REVIEW_LINE_LABEL };

export const REVIEW_KIND_LABEL: Record<AdminPendingItem["kind"], string> = {
  agent_application: "Agent application",
  banner: "Banner",
  property_submission: "Property listing",
};

const REVIEW_KIND_HREF: Record<AdminPendingItem["kind"], string> = {
  agent_application: "/dashboard/agents",
  banner: "/dashboard/campaign-approvals?type=banners",
  property_submission: "/dashboard/property-review",
};

export function PendingReviewList({
  items,
  emptyMessage,
}: {
  items: AdminPendingItem[];
  emptyMessage: string;
}) {
  return (
    <PendingReviewTable
      items={items}
      kindLabel={REVIEW_KIND_LABEL}
      kindHref={REVIEW_KIND_HREF}
      emptyTitle="Nothing needs your review"
      emptyDescription={emptyMessage}
    />
  );
}
