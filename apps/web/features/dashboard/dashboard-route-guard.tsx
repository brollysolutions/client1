"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/session-provider";

import { useLine } from "./line-provider";
import { isDashboardPathAllowed } from "./nav-items";
import { DashboardPageSkeleton } from "./dashboard-page-skeleton";

// Consistent dashboard UX gate for direct URL entry. This reads the same
// role/line capability catalogue as the sidebar, but it is never an
// authorization boundary: API dependencies, service checks, and RLS still
// decide whether data can be read or changed.
export function DashboardRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useAuth();
  const { activeLine, lines } = useLine();

  const allowed =
    session != null &&
    isDashboardPathAllowed(pathname, {
      role: session.role,
      businessLine: session.businessLine,
      activeLine,
      // An unavailable /auth/me response must not become a browser auth wall.
      // Once known, held Client lines make cross-line direct URLs deterministic.
      profileLines: lines.length > 0 ? lines : undefined,
      staffFeatures: session.staffFeatures,
    });

  React.useEffect(() => {
    if (session != null && !allowed) router.replace("/dashboard");
  }, [allowed, router, session]);

  if (!allowed) {
    return <DashboardPageSkeleton label="Checking dashboard access" />;
  }

  return <>{children}</>;
}
