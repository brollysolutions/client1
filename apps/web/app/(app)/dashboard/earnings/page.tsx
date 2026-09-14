"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DashboardPageSkeleton } from "@/features/dashboard/dashboard-page-skeleton";

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
      <DashboardPageSkeleton />
    );
  }
  return <AgentEarningsView />;
}
