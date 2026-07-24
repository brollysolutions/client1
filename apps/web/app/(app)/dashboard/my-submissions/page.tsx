"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { MySubmissionsView } from "@/features/real-estate/my-submissions-view";

// Agent-gated route. UX gate only: RLS scopes the GET to the submitter, so a
// non-agent who forces the route sees an empty list, never another agent's
// rows. Deliberately NOT widened to sub_admin like property-submit: sub_admin
// is always platform-scoped, so property_submissions_select's platform_scope
// branch would show them the ENTIRE review queue here, mislabeled as "my
// submissions" — sub_admin already has the correct queue view at
// /dashboard/property-review.
export default function MySubmissionsPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed = session != null && session.role === "agent";

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
  return <MySubmissionsView />;
}
