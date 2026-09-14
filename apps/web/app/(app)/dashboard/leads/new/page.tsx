"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DashboardPageSkeleton } from "@/features/dashboard/dashboard-page-skeleton";

import { useAuth } from "@/components/auth/session-provider";
import { AgentIntroduceLeadForm } from "@/features/agent/agent-introduce-lead-form";

// Agent-only route. AppGuard (the (app) layout) enforces auth; this adds the
// role gate. UX gate only — the API's require_agent is the real wall.
export default function IntroduceLeadPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed = session != null && session.role === "agent";

  React.useEffect(() => {
    if (!isLoading && !allowed) router.replace("/dashboard");
  }, [isLoading, allowed, router]);

  if (isLoading || !allowed) {
    return (
      <DashboardPageSkeleton />
    );
  }
  return <AgentIntroduceLeadForm />;
}
