"use client";

import * as React from "react";
import { DashboardPageSkeleton } from "@/features/dashboard/dashboard-page-skeleton";
import { useParams, useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/session-provider";
import { EditPropertyForm } from "@/features/real-estate/edit-property-form";

export default function CorrectApprovedPropertyPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed = session?.role === "admin";

  React.useEffect(() => {
    if (!isLoading && !allowed) router.replace("/dashboard");
  }, [allowed, isLoading, router]);

  if (isLoading || !allowed) {
    return (
      <DashboardPageSkeleton />
    );
  }

  return <EditPropertyForm submissionId={params.id} adminCorrection />;
}
