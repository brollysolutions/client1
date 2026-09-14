"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { DashboardPageSkeleton } from "./dashboard-page-skeleton";

/** Keep the workspace visible while an automatic product destination loads. */
export function DashboardRedirect({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  useEffect(() => { router.replace(href); }, [href, router]);
  return <DashboardPageSkeleton label={label} />;
}
