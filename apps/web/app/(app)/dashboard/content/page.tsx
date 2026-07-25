"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { ContentView } from "@/features/sub-admin/content-view";

// Sub Admin owns the full lifecycle; Admin gets read-only oversight of the same
// shared queue (RLS's content_blocks_select policy grants both, migration
// d7e8f9a0b1c2). AppGuard (the (app) layout) enforces auth; this adds the role
// gate. UX gate only: the API's require_sub_admin + RLS are the real wall, and
// there is no Admin write endpoint at all for content blocks.
const CONTENT_ROLES = new Set(["sub_admin", "admin"]);

export default function ContentPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed = session != null && CONTENT_ROLES.has(session.role);

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
  return <ContentView />;
}
