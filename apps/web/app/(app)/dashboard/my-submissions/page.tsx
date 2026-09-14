"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DashboardPageSkeleton } from "@/features/dashboard/dashboard-page-skeleton";

import { useAuth } from "@/components/auth/session-provider";
import { MySubmissionsView } from "@/features/real-estate/my-submissions-view";

// Author workspace for real-estate Agents, Sub Admins, and Admins. This is only
// a routing hint; the API and RLS enforce role, ownership, and line boundaries.
export default function MySubmissionsPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed =
    session != null &&
    ["agent", "sub_admin", "admin"].includes(session.role) &&
    (session.role !== "agent" ||
      session.businessLine === "real_estate" ||
      session.businessLine === "both");

  React.useEffect(() => {
    if (!isLoading && !allowed) router.replace("/dashboard");
  }, [isLoading, allowed, router]);

  if (isLoading || !allowed) {
    return (
      <DashboardPageSkeleton />
    );
  }
  return <MySubmissionsView />;
}
