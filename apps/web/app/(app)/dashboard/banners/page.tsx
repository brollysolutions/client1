"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { BannersView } from "@/features/sub-admin/banners-view";

// Sub Admin creates/edits/submits; Admin approves/rejects the same shared
// queue (RLS's banners_select policy grants both, migration a4b5c6d7e8f9).
// AppGuard (the (app) layout) enforces auth; this adds the role gate. UX gate
// only: the API's require_sub_admin/require_admin + RLS are the real wall.
const BANNER_ROLES = new Set(["sub_admin", "admin"]);

export default function BannersPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed = session != null && BANNER_ROLES.has(session.role);

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
  return <BannersView />;
}
