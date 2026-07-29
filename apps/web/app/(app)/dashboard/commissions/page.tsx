"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { CommissionsView } from "@/features/admin/commissions-view";

// Admin-only, mirroring dashboard/audit-log/page.tsx and
// dashboard/analytics/page.tsx exactly. This is a UX gate only -- the real
// wall is the local _require_admin (role AND platform_scope) in
// api/v1/commissions.py plus the commissions_insert/update RLS policies.
const ADMIN_ROLES = new Set(["admin"]);

export default function CommissionsPage() {
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
  return <CommissionsView />;
}
