"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { AuditLogView } from "@/features/admin/audit-log-view";

// Admin-only, and unusually strict about it: Sub Admin is excluded even though it
// shares most other oversight surfaces, because several audited actions ARE Sub
// Admin actions (payout maker-checker, listing review). UX gate only. The real
// walls are require_admin on the endpoint and the audit_log_select RLS policy,
// which no other role satisfies, so a Sub Admin who reached the API directly
// would read zero rows rather than someone else's oversight record.
const ADMIN_ROLES = new Set(["admin"]);

export default function AuditLogPage() {
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
  return <AuditLogView />;
}
