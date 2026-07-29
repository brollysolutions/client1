"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { BroadcastView } from "@/features/admin/broadcast-view";

// Admin-only UX gate, mirroring dashboard/audit-log/page.tsx exactly. The
// real wall is the API's platform-scoped _require_admin check — the
// frontend has no platform_scope on the session to gate on more precisely.
const ADMIN_ROLES = new Set(["admin"]);

export default function BroadcastPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed = session != null && ADMIN_ROLES.has(session.role);

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
  return <BroadcastView />;
}
