"use client";

import { Suspense } from "react";

import { useAuth } from "@/components/auth/session-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminHome } from "@/features/admin/admin-home";
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

  if (session?.role === "admin") {
    return <AdminHome />;
  }

  if (!isClient) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-10">
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-text-secondary">
            This dashboard is for client accounts. Your role&apos;s workspace isn&apos;t available
            here yet.
          </p>
        </div>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 sm:px-6 lg:px-10">
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-10">
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      </div>
    );
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
