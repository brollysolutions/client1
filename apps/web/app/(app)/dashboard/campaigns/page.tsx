"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";

// The tabbed Campaign Studio became two pages. Notifications emitted before
// that change link here with ?type=banners|offers (services/banners.py,
// services/offers.py), so this keeps resolving them rather than dropping
// people on a 404.
export default function CampaignsPage() {
  const router = useRouter();
  const search = useSearchParams();
  const { session, isLoading } = useAuth();

  React.useEffect(() => {
    if (isLoading) return;
    const offers = search.get("type") === "offers";
    if (session?.role === "admin") {
      router.replace(`/dashboard/campaign-approvals?type=${offers ? "offers" : "banners"}`);
    } else if (session?.role === "sub_admin") {
      router.replace(offers ? "/dashboard/offers" : "/dashboard/banners");
    } else {
      router.replace("/dashboard");
    }
  }, [isLoading, router, search, session?.role]);

  return (
    <div className="grid min-h-[50vh] place-items-center">
      <Loader2 className="h-6 w-6 animate-spin text-brand-blue" aria-hidden="true" />
      <span className="sr-only">Opening campaigns</span>
    </div>
  );
}
