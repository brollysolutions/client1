import type { ReactNode } from "react";

import { AuthProvider } from "@/components/auth/session-provider";

// The auth route group renders full-bleed with no site navbar/footer (unlike
// the (public) group) — each screen is its own split-screen surface.
// AuthProvider is mounted here (not at the root) so the login/register screens
// can read + set the session without the public site paying for a refresh call.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <main className="min-h-screen">{children}</main>
    </AuthProvider>
  );
}
