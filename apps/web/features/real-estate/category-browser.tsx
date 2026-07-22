"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";
import { PropertyBrowser } from "@/features/real-estate/property-browser";
import { useProperties } from "@/features/real-estate/use-properties";
import type { RECategory } from "@/lib/real-estate";

// Client child for the per-category Explore page: fetches the catalog (the
// token is in-memory, so the parent server component cannot), scopes it to one
// category, and hands it to PropertyBrowser with the category pinned invisibly.
// The server component owns the static params, category validation, and the
// back link / heading around this.
export function CategoryBrowser({
  categoryKey,
  header,
}: {
  categoryKey: RECategory;
  header: React.ReactNode;
}) {
  const { listings, loading, error, retry } = useProperties();

  if (loading) return <Skeleton className="h-40 rounded-xl" />;
  if (error) return <FetchError status={null} message={error} onRetry={retry} />;

  const scoped = listings.filter((l) => l.category === categoryKey);

  return <PropertyBrowser source={scoped} lockedCategory={categoryKey} header={header} />;
}
