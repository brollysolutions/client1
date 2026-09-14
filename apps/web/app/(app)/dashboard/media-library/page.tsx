"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DashboardPageSkeleton } from "@/features/dashboard/dashboard-page-skeleton";

import { useAuth } from "@/components/auth/session-provider";
import { MediaLibraryView } from "@/features/sub-admin/media-library-view";

export default function MediaLibraryPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed = session?.role === "sub_admin";
  React.useEffect(() => { if (!isLoading && !allowed) router.replace("/dashboard"); }, [allowed, isLoading, router]);
  if (isLoading || !allowed) return <DashboardPageSkeleton />;
  return <MediaLibraryView />;
}
