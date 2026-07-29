"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { AgentEarningsView } from "@/features/agent/agent-earnings-view";

// Agent-gated route, mirroring dashboard/leads/page.tsx. UX gate only -- the
// API's require_agent plus commissions_select's own-row RLS branch are the
// real wall.
const AGENT_ROLES = new Set(["agent"]);

export default function EarningsPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed = session != null && AGENT_ROLES.has(session.role);

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
  return <AgentEarningsView />;
}
