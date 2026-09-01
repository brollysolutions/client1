"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { BannersView } from "@/features/sub-admin/banners-view";

// Banners and dashboard offers are separate pages: an author works on one kind
// of campaign at a time, and a tab shell only hid half the queue behind a click.
// Admin reviews both from the single approvals desk instead.
//
// AppGuard (the (app) layout) enforces authentication; this is a routing hint
// only. require_sub_admin plus RLS remain the authorization boundary.
export default function BannersPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed = session?.role === "sub_admin";

  React.useEffect(() => {
    if (isLoading) return;
    if (session?.role === "admin") router.replace("/dashboard/campaign-approvals?type=banners");
    else if (!allowed) router.replace("/dashboard");
  }, [allowed, isLoading, router, session?.role]);

  if (isLoading || !allowed) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-blue" aria-hidden="true" />
        <span className="sr-only">Loading banners</span>
      </div>
    );
  }
  return <BannersView />;
}
