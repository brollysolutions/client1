"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DashboardPageSkeleton } from "@/features/dashboard/dashboard-page-skeleton";

import { useAuth } from "@/components/auth/session-provider";
import { AdminVehicleArrangementsView } from "@/features/admin/vehicle-arrangements-view";
import { EmployeeVehicleArrangementsView } from "@/features/employee/vehicle-arrangements-view";

export default function VehicleArrangementsPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed =
    session?.role === "admin" ||
    (session?.role === "employee" &&
      (session.businessLine === "real_estate" || session.businessLine === "both"));

  React.useEffect(() => {
    if (!isLoading && !allowed) router.replace("/dashboard");
  }, [allowed, isLoading, router]);

  if (isLoading || !allowed) {
    return (
      <DashboardPageSkeleton />
    );
  }
  return session.role === "admin" ? (
    <AdminVehicleArrangementsView />
  ) : (
    <EmployeeVehicleArrangementsView />
  );
}
