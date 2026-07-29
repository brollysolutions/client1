"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { AnalyticsView } from "@/features/admin/analytics/analytics-view";

// Admin-only, mirroring dashboard/audit-log/page.tsx exactly. This is a UX
// gate only -- the real wall is the local _require_admin (role AND
// platform_scope) in api/v1/reporting.py.
const ADMIN_ROLES = new Set(["admin"]);

export default function AnalyticsPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed = session != null && ADMIN_ROLES.has(session.role);

  React.useEffect(() => {
    if (!isLoading && !allowed) router.replace("/dashboard");
  }, [isLoading, allowed, router]);

  if (isLoading || !allowed) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
      </div>
    );
  }
  return <AnalyticsView />;
}
