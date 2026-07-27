"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { ReferralPayoutsView } from "@/features/admin/referral-payouts-view";

// Admin-only route. AppGuard (the (app) layout) already enforces auth; this
// adds the role gate. UX gate only — the API's require_admin (referrals
// router) is the real wall, same pattern as app/(app)/dashboard/agents/page.tsx.
//
// A distinct route from /dashboard/referrals (the client's own code +
// tracking) and /dashboard/referral-rules (Sub Admin/Admin bonus RULES
// editor) — this is the third, separate thing: Admin execution of an
// already-accrued bonus.
const ADMIN_ROLES = new Set(["admin"]);

export default function ReferralPayoutsPage() {
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
  return <ReferralPayoutsView />;
}
