"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { AgentLeadDetailView } from "@/features/agent/agent-lead-detail-view";
import { TelecallerLeadDetailView } from "@/features/telecaller/telecaller-lead-detail-view";

// Telecaller- and Agent-gated route. AppGuard (the (app) layout) already
// enforces auth; this adds the role gate. UX gate only — the API's
// require_telecaller / require_agent are the real wall.
const LEADS_ROLES = new Set(["telecaller", "agent"]);

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { session, isLoading } = useAuth();
  const allowed = session != null && LEADS_ROLES.has(session.role);

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
  return session?.role === "agent" ? (
    <AgentLeadDetailView leadId={params.id} />
  ) : (
    <TelecallerLeadDetailView leadId={params.id} />
  );
}
