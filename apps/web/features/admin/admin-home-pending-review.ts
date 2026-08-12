import type { AdminPendingItem } from "@/lib/admin-api";

export type PendingReviewFilters = {
  search?: string;
  kind?: "all" | AdminPendingItem["kind"];
  businessLine?: "all" | AdminPendingItem["business_line"];
  submittedFrom?: string;
  submittedTo?: string;
};

export function filterPendingReview(
  items: AdminPendingItem[],
  { search, kind, businessLine, submittedFrom, submittedTo }: PendingReviewFilters,
): AdminPendingItem[] {
  const normalizedSearch = search?.trim().toLocaleLowerCase();

  return items.filter((item) => {
    const submittedDate = item.submitted_at.slice(0, 10);
    return (
      (!normalizedSearch || item.title.toLocaleLowerCase().includes(normalizedSearch)) &&
      (!kind || kind === "all" || item.kind === kind) &&
      (!businessLine || businessLine === "all" || item.business_line === businessLine) &&
      (!submittedFrom || submittedDate >= submittedFrom) &&
      (!submittedTo || submittedDate <= submittedTo)
    );
  });
}
