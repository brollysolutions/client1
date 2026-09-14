"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  ChevronsUpDown,
  CircleHelp,
  ExternalLink,
  FileText,
  Headset,
  LogOut,
  Rocket,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/session-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { logout } from "@/lib/auth";
import { cn } from "@/lib/utils";

import { useLine } from "./line-provider";
import { useMe } from "./me-provider";

// Help and legal destinations retain the authenticated workspace.
const HELP_LINKS = [
  { key: "get-started", label: "Get started", icon: Rocket, href: "/dashboard/get-started", external: false },
  { key: "help-center", label: "Help center", icon: BookOpen, href: "/dashboard/help-center", external: false },
  { key: "support", label: "Customer support", icon: Headset, href: "/dashboard/support", external: false },
  { key: "terms", label: "Terms of service", icon: FileText, href: "/dashboard/terms", external: false },
  { key: "privacy", label: "Privacy policy", icon: ShieldCheck, href: "/dashboard/privacy", external: false },
] as const;

// Bottom-of-rail account menu. The whole profile block is the trigger; on hover
// it glows and shows an up/down chevron. Clicking opens a menu above it with
// settings, appearance, help, and sign out. The surface
// uses the app background with light-blue hover, matching the rail.
export function AccountMenu({
  labeled,
  onNavigate,
}: {
  labeled: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const { clear } = useAuth();
  const { me } = useMe();
  const { activeLine } = useLine();
  const [signingOut, setSigningOut] = React.useState(false);

  if (!me) return null;

  const fullName = `${me.firstName} ${me.lastName}`.trim() || "Your account";
  const customerCode = me.profiles.find((p) => p.businessLine === activeLine)?.customerCode;

  async function handleLogout() {
    if (signingOut) return;
    setSigningOut(true);
    const result = await logout();
    clear();
    if (!result.ok) {
      toast.info("Signed out.", { description: "You've been signed out on this device." });
    }
    router.replace("/login");
  }

  function go(href: string) {
    onNavigate?.();
    router.push(href);
  }

  return (
    <div className="mt-auto shrink-0 border-t border-white/15 pt-3">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Open account menu"
          className={cn(
            "group/acct relative flex cursor-pointer items-center rounded-lg text-left transition-[background-color,box-shadow] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-sky",
            "hover:bg-dash-rail-hover hover:shadow-sm hover:ring-1 hover:ring-brand-sky/30",
            "data-[state=open]:bg-dash-rail-hover data-[state=open]:ring-1 data-[state=open]:ring-brand-sky/30",
            labeled ? "w-full gap-3 px-2 py-2" : "mx-auto h-12 w-12 justify-center",
          )}
        >
          <UserAvatar name={fullName} email={me.email} size="sm" />
          {labeled && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-dash-foreground">
                  {fullName}
                </span>
                {customerCode && (
                  <span className="block truncate font-mono text-xs text-dash-muted">
                    {customerCode}
                  </span>
                )}
              </span>
              <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 text-dash-muted opacity-0 transition-opacity group-hover/acct:opacity-100 group-focus-visible/acct:opacity-100 group-data-[state=open]/acct:opacity-100" />
            </>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-72 bg-surface"
        >
          {/* Account header */}
          <div className="flex items-center gap-3 px-2.5 py-2">
            <UserAvatar name={fullName} email={me.email} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text-primary">{fullName}</p>
              {me.email && <p className="truncate text-xs text-text-secondary">{me.email}</p>}
            </div>
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={() => go("/dashboard/settings")}>
            <Settings />
            All settings
            <span className="ml-auto text-xs text-text-secondary">⇧⌘,</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Help */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <CircleHelp />
              Help
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {HELP_LINKS.map(({ key, label, icon: Icon, href, external }) => (
                <React.Fragment key={key}>
                  <DropdownMenuItem onSelect={() => go(href)}>
                    <Icon />
                    {label}
                    {external && <ExternalLink className="ml-auto" />}
                  </DropdownMenuItem>
                  {key === "support" && <DropdownMenuSeparator />}
                </React.Fragment>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            disabled={signingOut}
            onSelect={(e) => {
              e.preventDefault();
              void handleLogout();
            }}
            className={cn(
              "data-[highlighted]:text-error data-[highlighted]:[&_svg]:text-error data-[highlighted]:before:bg-error",
              signingOut && "opacity-60",
            )}
          >
            <LogOut />
            {signingOut ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
