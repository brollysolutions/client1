"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { AuthProvider, useAuth } from "@/components/auth/session-provider";
import { AppShell } from "@/features/dashboard/app-shell";

// Client-side route guard for the authenticated app surface. This is a UX gate
// only, not the security boundary: the real access control is Postgres RLS plus
// the API's own token checks. It waits on `isLoading` so a logged-in user who
// just hard-reloaded (token re-hydrating via the refresh cookie) is not bounced.
function AppGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-brand-navy" />
      </div>
    );
  }

  return <>{children}</>;
}

// AuthProvider is mounted here (not at the root) so public marketing pages never
// fire a session refresh. The provider hydrates from the refresh cookie, then
// the guard gates. NuqsAdapter is scoped here (not global) so the dashboard's
// URL-query state (currently the real-estate search/filter facets) works,
// mirroring the /calculators subtree's own adapter scoping.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <NuqsAdapter>
      <AuthProvider>
        <AppGuard>
          <AppShell>{children}</AppShell>
        </AppGuard>
      </AuthProvider>
    </NuqsAdapter>
  );
}
