"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { LoanConfigView } from "@/features/admin/loan-config-view";

// Admin-only (require_admin on every /api/v1/admin/loan-types|banks|bank-
// availability route, plus the loan_types_update/banks_update RLS policies,
// which no other role's WITH CHECK satisfies). UX gate only.
const LOAN_CONFIG_ROLES = new Set(["admin"]);

export default function LoanConfigPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed = session != null && LOAN_CONFIG_ROLES.has(session.role);

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
  return <LoanConfigView />;
}
