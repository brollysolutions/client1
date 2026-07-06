import type { ReactNode } from "react";

// The auth route group renders full-bleed with no site navbar/footer (unlike
// the (public) group) — each screen is its own split-screen surface.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="min-h-screen">{children}</main>;
}
