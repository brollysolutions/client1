"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { EmployeeTaskDetailView } from "@/features/employee/employee-task-detail-view";

// Employee-only route. AppGuard (the (app) layout) already enforces auth; this
// adds the role gate. UX gate only — the API's require_employee is the real wall.
const EMPLOYEE_ROLES = new Set(["employee"]);

export default function TaskDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { session, isLoading } = useAuth();
  const allowed = session != null && EMPLOYEE_ROLES.has(session.role);

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
  return <EmployeeTaskDetailView taskId={params.id} />;
}
