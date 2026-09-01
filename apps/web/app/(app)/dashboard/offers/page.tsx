"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { OffersView } from "@/features/sub-admin/offers-view";

// See the banners page: one page per campaign kind for authors, one shared
// approvals desk for Admin. Routing hint only — the API and RLS decide access.
export default function OffersPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed = session?.role === "sub_admin";

  React.useEffect(() => {
    if (isLoading) return;
    if (session?.role === "admin") router.replace("/dashboard/campaign-approvals?type=offers");
    else if (!allowed) router.replace("/dashboard");
  }, [allowed, isLoading, router, session?.role]);

  if (isLoading || !allowed) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-blue" aria-hidden="true" />
        <span className="sr-only">Loading offers</span>
      </div>
    );
  }
  return <OffersView />;
}
