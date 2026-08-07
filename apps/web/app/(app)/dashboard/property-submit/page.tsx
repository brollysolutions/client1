"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { SubmitPropertyForm } from "@/features/real-estate/submit-property-form";

// Client + Agent + Sub Admin-gated route. AppGuard (the (app) layout) enforces auth;
// this adds the role gate. UX gate only: the API's require_re_submitter + RLS
// are the real wall.
const SUBMITTER_ROLES = new Set(["client", "agent", "sub_admin"]);

export default function PropertySubmitPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed = session != null && SUBMITTER_ROLES.has(session.role);

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
  return <SubmitPropertyForm />;
}
