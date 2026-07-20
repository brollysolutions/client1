"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, MailWarning, Settings } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/session-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { logout } from "@/lib/auth";
import { cn } from "@/lib/utils";

import { useMe } from "./me-provider";

function lineLabel(line: "loans" | "real_estate") {
  return line === "loans" ? "Loans" : "Real Estate";
}

// Google-style account menu, anchored top-right. The avatar opens a card with
// the user's details (name, email + verification, profile codes) and the account
// actions (settings, log out). This is the single home for profile + settings.
export function ProfileMenu() {
  const router = useRouter();
  const { session, clear } = useAuth();
  const { me } = useMe();
  const [signingOut, setSigningOut] = React.useState(false);

  const fullName = me ? `${me.firstName} ${me.lastName}`.trim() : "";
  const emailVerified = me?.emailVerified ?? session?.emailVerified ?? false;

  async function handleLogout() {
    if (signingOut) return;
    setSigningOut(true);
    const result = await logout();
    clear();
    if (!result.ok) {
      toast.info("Signed out.", {
        description: "You've been signed out on this device.",
      });
    }
    router.replace("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Open account menu"
        className="flex cursor-pointer items-center gap-1.5 rounded-full p-0.5 text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
      >
        <UserAvatar name={fullName} email={me?.email} size="sm" />
        <ChevronDown className="hidden h-4 w-4 sm:block" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        {/* Account header */}
        <div className="flex items-center gap-3 px-2.5 py-2">
          <UserAvatar name={fullName} email={me?.email} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-primary">
              {fullName || "Your account"}
            </p>
            {me?.email && <p className="truncate text-xs text-text-secondary">{me.email}</p>}
          </div>
        </div>

        {!emailVerified && (
          <DropdownMenuItem onSelect={() => router.push("/dashboard/settings")}>
            <MailWarning className="text-warning" />
            <span className="text-warning">Verify your email</span>
          </DropdownMenuItem>
        )}

        {me && me.profiles.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2.5 py-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                Profile IDs
              </p>
              <dl className="mt-1.5 space-y-1">
                {me.profiles.map((p) => (
                  <div key={p.businessLine} className="flex items-center justify-between gap-3">
                    <dt className="text-xs text-text-secondary">{lineLabel(p.businessLine)}</dt>
                    <dd className="font-mono text-xs font-semibold text-text-primary">
                      {p.customerCode}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/dashboard/settings")}>
          <Settings />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={signingOut}
          onSelect={(e) => {
            // Keep the menu logic running past the close; logout redirects anyway.
            e.preventDefault();
            void handleLogout();
          }}
          className={cn(signingOut && "opacity-60")}
        >
          <LogOut />
          {signingOut ? "Signing out…" : "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
