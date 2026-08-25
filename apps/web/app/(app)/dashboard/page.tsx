"use client";

import { Suspense } from "react";

import { useAuth } from "@/components/auth/session-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminHome } from "@/features/admin/admin-home";
import { AgentHome } from "@/features/agent/agent-home";
import { FetchError } from "@/features/dashboard/fetch-error";
import { useLine } from "@/features/dashboard/line-provider";
import { LoansApplications } from "@/features/dashboard/loans-applications";
import { PersonalizedPlacements } from "@/features/dashboard/personalized-placements";
import { useMe } from "@/features/dashboard/me-provider";
import { EmployeeHome } from "@/features/employee/employee-home";
import { RealEstateHome } from "@/features/real-estate/real-estate-home";
import { SubAdminHome } from "@/features/sub-admin/sub-admin-home";
import { TelecallerHome } from "@/features/telecaller/telecaller-home";

export default function DashboardPage() {
  const { session } = useAuth();
  const { me, status, error, errorStatus, retry } = useMe();
  const { activeLine } = useLine();
  const isClient = session?.role === "client";

  if (session?.role === "admin") {
    return <AdminHome />;
  }

  if (session?.role === "sub_admin") {
    return <SubAdminHome />;
  }

  if (session?.role === "telecaller") {
    return <TelecallerHome />;
  }

  if (session?.role === "employee") {
    return <EmployeeHome />;
  }

  if (session?.role === "agent") {
    const agentLine = session.businessLine === "real_estate" ? "real_estate" : "loans";
    return (
      <>
        <PersonalizedPlacements businessLine={agentLine} />
        <AgentHome />
      </>
    );
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
    // No placement banner here: search is the primary action on this home, and
    // the promotional slot pushed it below the fold. The loans client home made
    // the same call. Agents (above) keep their placements.
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
