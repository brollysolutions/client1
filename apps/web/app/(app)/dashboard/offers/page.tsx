"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { OffersView } from "@/features/sub-admin/offers-view";

// Sub Admin owns the full lifecycle; Admin gets read-only oversight of the
// same shared queue (RLS's offers_select policy grants both, migration
// b5c6d7e8f9a0). AppGuard (the (app) layout) enforces auth; this adds the
// role gate. UX gate only: the API's require_sub_admin + RLS are the real
// wall — there is no Admin write endpoint at all for offers.
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
