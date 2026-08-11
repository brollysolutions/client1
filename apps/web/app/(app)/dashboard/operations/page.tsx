"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { OperationalRecordsView } from "@/features/admin/operational-records-view";

export default function OperationalRecordsPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const allowed = session?.role === "admin";

  React.useEffect(() => {
    if (!isLoading && !allowed) router.replace("/dashboard");
  }, [allowed, isLoading, router]);

  if (isLoading || !allowed) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
      </div>
    );
  }

  return <OperationalRecordsView />;
}
