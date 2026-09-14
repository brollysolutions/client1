"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DashboardPageSkeleton } from "@/features/dashboard/dashboard-page-skeleton";

import { useAuth } from "@/components/auth/session-provider";
import { PayoutsView } from "@/features/admin/payouts-view";

// AppGuard already enforces auth; this adds the Admin-or-granted-Sub-Admin UX
// gate. The API dependency and payout RLS policy remain the authorization wall.

export default function PayoutsPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed =
    session != null &&
    (session.role === "admin" ||
      (session.role === "sub_admin" && session.staffFeatures.includes("payout_requests")));

  React.useEffect(() => {
    if (!isLoading && !allowed) router.replace("/dashboard");
  }, [isLoading, allowed, router]);

  if (isLoading || !allowed) {
    return (
      <DashboardPageSkeleton />
    );
  }
  return <PayoutsView />;
}
