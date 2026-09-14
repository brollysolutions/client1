"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DashboardPageSkeleton } from "@/features/dashboard/dashboard-page-skeleton";

import { useAuth } from "@/components/auth/session-provider";

export default function BannerMediaPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed = session?.role === "sub_admin" || session?.role === "admin";

  React.useEffect(() => {
    if (isLoading) return;
    if (!allowed) router.replace("/dashboard");
    else router.replace(session?.role === "sub_admin" ? "/dashboard/media-library" : "/dashboard/campaign-approvals");
  }, [allowed, isLoading, router, session?.role]);

  if (isLoading || !allowed) {
    return (
      <DashboardPageSkeleton />
    );
  }
  return null;
}
