"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { ListingApprovalsView } from "@/features/admin/listing-approvals-view";

// Platform Admin-only route. AppGuard (the (app) layout) already enforces auth;
// this adds the role gate. UX gate only, the API's require_platform_admin + RLS are
// the real wall, so a non-reviewer who forces the route still gets no data.
const REVIEWER_ROLES = new Set(["admin"]);

export default function PropertyReviewPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed = session != null && REVIEWER_ROLES.has(session.role);

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
  return <ListingApprovalsView />;
}
