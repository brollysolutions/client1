"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

import { EmailVerifyBanner } from "@/components/auth/email-verify-banner";
import { useAuth } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getMe, logout, type BusinessLine, type Me } from "@/lib/auth";

// Every client holds both lines. The dashboard shows one line's profile at a
// time and switches between them. Kept brand-blue (no green/amber accent) for
// now; the line palette applies once real per-line content exists.
const ACTIVE_LINE_KEY = "dashboard:active-line";

const LINES: { value: BusinessLine; label: string }[] = [
  { value: "loans", label: "Loans" },
  { value: "real_estate", label: "Real Estate" },
];

function lineLabel(line: BusinessLine) {
  return line === "loans" ? "Loans" : "Real Estate";
}

export default function DashboardPage() {
  const router = useRouter();
  const { clear, session } = useAuth();
  const isClient = session?.role === "client";
  const [me, setMe] = React.useState<Me | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [activeLine, setActiveLine] = React.useState<BusinessLine>("loans");
  const [signingOut, setSigningOut] = React.useState(false);
  const [emailJustVerified, setEmailJustVerified] = React.useState(false);
  // Soft 2FA: prompt any logged-in user whose email isn't verified yet.
  const showEmailBanner = session?.emailVerified === false && !emailJustVerified;

  // Restore the last-viewed line before the first paint of the switch.
  React.useEffect(() => {
    const saved = localStorage.getItem(ACTIVE_LINE_KEY);
    if (saved === "loans" || saved === "real_estate") setActiveLine(saved);
  }, []);

  React.useEffect(() => {
    // /me is the client surface; don't fetch it for staff/agent sessions.
    if (!isClient) {
      setLoading(false);
      return;
    }
    let active = true;
    void (async () => {
      const res = await getMe();
      if (!active) return;
      if (res.ok) setMe(res.data);
      else setError(res.error);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [isClient]);

  function switchLine(line: BusinessLine) {
    setActiveLine(line);
    localStorage.setItem(ACTIVE_LINE_KEY, line);
  }

  async function handleLogout() {
    if (signingOut) return;
    setSigningOut(true);
    const result = await logout();
    // clear() + redirect run regardless, so the user IS signed out locally even
    // when the server call fails. Frame that as a benign sign-out, not a red error
    // (audit L4); the server-side token is cleaned up on its next use / expiry.
    clear();
    if (!result.ok) {
      toast.info("Signed out.", {
        description: "You've been signed out on this device.",
      });
    }
    router.replace("/login");
  }

  const activeProfile = me?.profiles.find((p) => p.businessLine === activeLine);

  return (
    <main
      className="min-h-screen bg-background"
      style={{ backgroundColor: "var(--background)" }}
    >
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <p className="text-sm text-text-secondary">Welcome</p>
          <h1 className="font-heading text-lg font-semibold text-text-primary">
            {me ? `${me.firstName} ${me.lastName}` : "…"}
          </h1>
        </div>
        <Button variant="outline" onClick={handleLogout} disabled={signingOut}>
          <LogOut className="h-4 w-4" />
          {signingOut ? "Signing out…" : "Log out"}
        </Button>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        {showEmailBanner && (
          <EmailVerifyBanner onVerified={() => setEmailJustVerified(true)} />
        )}
        {!isClient ? (
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-text-secondary">
              This dashboard is for client accounts. Your role&apos;s workspace
              isn&apos;t available here yet.
            </p>
          </div>
        ) : loading ? (
          <p className="text-sm text-text-secondary">Loading your profiles…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !me || me.profiles.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-text-secondary">
              No client profiles are linked to this account yet.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div
              role="tablist"
              aria-label="Business line"
              className="inline-flex rounded-lg border border-border bg-card p-1"
            >
              {LINES.map((l) => {
                const selected = activeLine === l.value;
                return (
                  <button
                    key={l.value}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => switchLine(l.value)}
                    className={cn(
                      "cursor-pointer rounded-md px-5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
                      selected
                        ? "bg-brand-navy text-surface"
                        : "text-text-secondary hover:text-text-primary",
                    )}
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <p className="text-sm text-text-secondary">
                Your {lineLabel(activeLine)} profile ID
              </p>
              <p className="mt-1 font-heading text-2xl font-bold tracking-wide text-brand-navy">
                {activeProfile?.customerCode ?? "—"}
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
