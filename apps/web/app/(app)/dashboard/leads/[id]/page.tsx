"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { TelecallerLeadDetailView } from "@/features/telecaller/telecaller-lead-detail-view";

// Telecaller-only route. AppGuard (the (app) layout) already enforces auth; this
// adds the role gate. UX gate only — the API's require_telecaller is the real wall.
const TELECALLER_ROLES = new Set(["telecaller"]);

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { session, isLoading } = useAuth();
  const allowed = session != null && TELECALLER_ROLES.has(session.role);

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
  return <TelecallerLeadDetailView leadId={params.id} />;
}
