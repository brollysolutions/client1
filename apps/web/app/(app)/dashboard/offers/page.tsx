"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { OffersView } from "@/features/sub-admin/offers-view";

// Sub Admin authors and publishes approved offers; Admin reviews the same
// queue. AppGuard enforces authentication and this is only a routing hint —
// API dependencies plus RLS remain the authorization boundary.
const OFFER_ROLES = new Set(["sub_admin", "admin"]);

export default function OffersPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed = session != null && OFFER_ROLES.has(session.role);

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
  return <OffersView />;
}
