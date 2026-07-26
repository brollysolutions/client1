"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssignedLeadsView } from "@/features/admin/assigned-leads-view";
import { LeadsQueueView } from "@/features/admin/leads-queue-view";

// Admin-only route. AppGuard (the (app) layout) already enforces auth; this adds
// the role gate. UX gate only — the API's require_admin is the real wall.
const ADMIN_ROLES = new Set(["admin"]);

export default function AdminLeadsPage() {
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
  return (
    <Tabs defaultValue="unassigned" className="pt-6">
      <TabsList className="mx-auto flex w-full max-w-5xl px-4 sm:px-6 lg:px-10">
        <TabsTrigger value="unassigned">Unassigned queue</TabsTrigger>
        <TabsTrigger value="assigned">Assigned leads</TabsTrigger>
      </TabsList>
      <TabsContent value="unassigned">
        <LeadsQueueView />
      </TabsContent>
      <TabsContent value="assigned">
        <AssignedLeadsView />
      </TabsContent>
    </Tabs>
  );
}
