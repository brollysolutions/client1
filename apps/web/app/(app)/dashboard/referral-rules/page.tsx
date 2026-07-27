"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { ReferralsView } from "@/features/sub-admin/referrals-view";

// Sub Admin owns the bonus rules; Admin gets read-only oversight of the same
// shared queue plus the payout-activity feed (RLS's referral_bonus_config_select
// policy grants both, migration f9a0b1c2d3e4; transactions_rls's narrowed
// referral_bonus branch grants Admin the same read, e8f9a0b1c2d3). AppGuard
// (the (app) layout) enforces auth; this adds the role gate. UX gate only: the
// API's require_sub_admin + RLS are the real wall, and there is no Admin write
// endpoint at all for referral bonus config.
//
// Moved from /dashboard/referrals (referral-program PR 1): that URL is now the
// CLIENT'S referral surface (code + share + conversion tracking), per
// Client_Dashboard_System_Design.md §3. This page was always a rules editor,
// not a referral list — the honest name frees "referrals" for the client.
const REFERRAL_ROLES = new Set(["sub_admin", "admin"]);

export default function ReferralRulesPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed = session != null && REFERRAL_ROLES.has(session.role);

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
  return <ReferralsView />;
}
