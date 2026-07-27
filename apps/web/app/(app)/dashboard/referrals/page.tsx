"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { ClientReferralsView } from "@/features/referrals/client-referrals-view";

// Client_Dashboard_System_Design.md §3: "my referral code, share (wa.me),
// conversion tracking". Sub Admin/Admin previously owned this URL for the
// bonus-rules editor; that surface moved to /dashboard/referral-rules
// (referral-program PR 1) so this route can be the spec'd client one.
// UX gate only — RLS (referrals_rls, referral_codes_rls) is the real wall,
// and eligibility (FR-9.1, clients only) is resolved server-side and
// reflected in the response body, not by a role check here: an agent still
// reaches this page, they just see why they have no code.
const STAFF_ROLES = new Set(["sub_admin", "admin"]);

export default function ReferralsPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const isStaff = session != null && STAFF_ROLES.has(session.role);

  React.useEffect(() => {
    if (!isLoading && isStaff) router.replace("/dashboard/referral-rules");
  }, [isLoading, isStaff, router]);

  if (isLoading || isStaff) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
      </div>
    );
  }
  return <ClientReferralsView />;
}
