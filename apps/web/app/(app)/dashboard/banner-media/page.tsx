"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";

export default function BannerMediaPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed = session?.role === "sub_admin" || session?.role === "admin";

  React.useEffect(() => {
    if (isLoading) return;
    if (!allowed) router.replace("/dashboard");
    else router.replace(session?.role === "sub_admin" ? "/dashboard/media-library" : "/dashboard/campaign-approvals");
  }, [allowed, isLoading, router, session?.role]);

  if (isLoading || !allowed) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
      </div>
    );
  }
  return null;
}
