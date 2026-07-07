"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { AuthProvider, useAuth } from "@/components/auth/session-provider";

// Client-side route guard for the authenticated app surface. This is a UX gate
// only, not the security boundary: the real access control is Postgres RLS plus
// the API's own token checks. It waits on `isLoading` so a logged-in user who
// just hard-reloaded (token re-hydrating via the refresh cookie) is not bounced.
function AppGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
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
// the guard gates.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppGuard>{children}</AppGuard>
    </AuthProvider>
  );
}
