"use client";

import { Suspense } from "react";

import { useAuth } from "@/components/auth/session-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";
import { useLine } from "@/features/dashboard/line-provider";
import { LoansApplications } from "@/features/dashboard/loans-applications";
import { useMe } from "@/features/dashboard/me-provider";
import { RealEstateHome } from "@/features/real-estate/real-estate-home";

export default function DashboardPage() {
  const { session } = useAuth();
  const { me, status, error, errorStatus, retry } = useMe();
  const { activeLine } = useLine();
  const isClient = session?.role === "client";

  if (!isClient) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-text-secondary">
          This dashboard is for client accounts. Your role&apos;s workspace isn&apos;t available
          here yet.
        </p>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="space-y-5">
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (status === "error") {
    return <FetchError status={errorStatus} message={error} onRetry={retry} />;
  }

  if (activeLine === "real_estate") {
    return (
      <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
        <RealEstateHome />
      </Suspense>
    );
  }

  // profiles may be empty briefly right after signup (backfilled by the scheduler);
  // the applications view still renders its own empty state, so nothing to gate on me here.
  void me;
  return <LoansApplications />;
}
