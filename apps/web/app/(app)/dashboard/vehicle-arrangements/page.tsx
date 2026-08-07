"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { AdminVehicleArrangementsView } from "@/features/admin/vehicle-arrangements-view";
import { EmployeeVehicleArrangementsView } from "@/features/employee/vehicle-arrangements-view";

export default function VehicleArrangementsPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed =
    session?.role === "admin" ||
    (session?.role === "employee" && session.businessLine === "real_estate");

  React.useEffect(() => {
    if (!isLoading && !allowed) router.replace("/dashboard");
  }, [allowed, isLoading, router]);

  if (isLoading || !allowed) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
      </div>
    );
  }
  return session.role === "admin" ? (
    <AdminVehicleArrangementsView />
  ) : (
    <EmployeeVehicleArrangementsView />
  );
}
