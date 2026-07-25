"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { AgentLeadsView } from "@/features/agent/agent-leads-view";
import { TelecallerLeadsView } from "@/features/telecaller/telecaller-leads-view";

// Telecaller- and Agent-gated route (each sees their own leads: assigned vs
// introduced). AppGuard (the (app) layout) already enforces auth; this adds
// the role gate. UX gate only — the API's require_telecaller / require_agent
// are the real wall.
const LEADS_ROLES = new Set(["telecaller", "agent"]);

export default function LeadsPage() {
  const router = useRouter();
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
  return session?.role === "agent" ? <AgentLeadsView /> : <TelecallerLeadsView />;
}
