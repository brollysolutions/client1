"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DashboardPageSkeleton } from "@/features/dashboard/dashboard-page-skeleton";

import { useAuth } from "@/components/auth/session-provider";
import { BannersView } from "@/features/sub-admin/banners-view";

// Banners and dashboard offers are separate pages: an author works on one kind
// of campaign at a time, and a tab shell only hid half the queue behind a click.
// Admin reviews both from the single approvals desk instead.
//
// AppGuard (the (app) layout) enforces authentication; this is a routing hint
// only. require_sub_admin plus RLS remain the authorization boundary.
export default function BannersPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed = session?.role === "sub_admin";

  React.useEffect(() => {
    if (isLoading) return;
    if (session?.role === "admin") router.replace("/dashboard/campaign-approvals?type=banners");
    else if (!allowed) router.replace("/dashboard");
  }, [allowed, isLoading, router, session?.role]);

  if (isLoading || !allowed) {
    return (
      <DashboardPageSkeleton label="Loading banners" />
    );
  }
  return <BannersView />;
}
