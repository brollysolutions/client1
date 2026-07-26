"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { PayoutsView } from "@/features/admin/payouts-view";

// Admin-only route. AppGuard (the (app) layout) already enforces auth; this adds
// the role gate. UX gate only — the API's _require_admin/_require_platform_admin
// on /api/v1/payouts is the real wall.
const ADMIN_ROLES = new Set(["admin"]);

export default function PayoutsPage() {
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
  return <PayoutsView />;
}
