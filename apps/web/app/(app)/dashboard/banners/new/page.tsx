"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { BannerForm } from "@/features/sub-admin/banner-form";

// Sub Admin-only route. AppGuard (the (app) layout) enforces auth; this adds
// the role gate. UX gate only: the API's require_sub_admin + RLS are the real
// wall.
export default function NewBannerPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed = session != null && session.role === "sub_admin";

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
  return <BannerForm />;
}
