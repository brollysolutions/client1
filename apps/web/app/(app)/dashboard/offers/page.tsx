"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";

// Sub Admin authors and publishes approved offers; Admin reviews the same
// queue. AppGuard enforces authentication and this is only a routing hint —
// API dependencies plus RLS remain the authorization boundary.
export default function OffersPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed = session?.role === "sub_admin" || session?.role === "admin";

  React.useEffect(() => {
    if (isLoading) return;
    if (!allowed) router.replace("/dashboard");
    else router.replace(session?.role === "admin" ? "/dashboard/campaign-approvals?type=offers" : "/dashboard/campaigns?type=offers");
  }, [isLoading, allowed, router, session?.role]);

  if (isLoading || !allowed) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
      </div>
    );
  }
  return null;
}
