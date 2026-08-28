"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";

// Sub Admin creates/edits/submits; Admin approves/rejects the same shared
// queue (RLS's banners_select policy grants both, migration a4b5c6d7e8f9).
// AppGuard (the (app) layout) enforces auth; this adds the role gate. UX gate
// only: the API's require_sub_admin/require_admin + RLS are the real wall.
export default function BannersPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed = session?.role === "sub_admin" || session?.role === "admin";

  React.useEffect(() => {
    if (isLoading) return;
    if (!allowed) router.replace("/dashboard");
    else router.replace(session?.role === "admin" ? "/dashboard/campaign-approvals?type=banners" : "/dashboard/campaigns?type=banners");
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
