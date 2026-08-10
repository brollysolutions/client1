"use client";

import * as React from "react";
import { Menu } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { LoanCompareProvider } from "@/features/loans/loan-offers-store";
import { RealEstateProvider } from "@/features/real-estate/store";
import { cn } from "@/lib/utils";

import { AppSidebar } from "./app-sidebar";
import { DashboardRouteGuard } from "./dashboard-route-guard";
import { LineProvider } from "./line-provider";
import { LineSwitcher } from "./line-switcher";
import { MeProvider } from "./me-provider";
import { NotificationBell } from "./notification-bell";
import { ProfileMenu } from "./profile-menu";
import { hasFixedDesktopSidebar, isDesktopSidebarExpanded } from "./shell-state";

const RAIL_OPEN_KEY = "dashboard:rail-open";

// Authenticated dashboard shell: Clients retain the remembered expandable icon
// rail, while operational roles use an always-labeled desktop sidebar. Every
// role gets the same mobile drawer and a top bar with line/account utilities.
export function AppShell({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [railOpen, setRailOpen] = React.useState(false);
  const fixedDesktopSidebar = hasFixedDesktopSidebar(session?.role);
  const desktopSidebarExpanded = isDesktopSidebarExpanded(session?.role, railOpen);

  // Restore the desktop rail state after mount (kept out of the initializer so
  // SSR and first paint always agree on the collapsed default).
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (session?.role !== "client") return;
    setRailOpen(window.localStorage.getItem(RAIL_OPEN_KEY) === "1");
  }, [session?.role]);

  const toggleRail = React.useCallback(() => {
    setRailOpen((open) => {
      const next = !open;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(RAIL_OPEN_KEY, next ? "1" : "0");
      }
      return next;
    });
  }, []);

  return (
    <MeProvider>
      <LineProvider>
        <RealEstateProvider>
          <LoanCompareProvider>
            <div className="font-geist min-h-screen bg-background">
              {/* Desktop rail — collapses to an icon strip, expands to a labeled list. */}
              <aside
                className={cn(
                  "fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-300 ease-out lg:block",
                  desktopSidebarExpanded ? "w-62" : "w-16",
                )}
              >
                <AppSidebar
                  expanded={desktopSidebarExpanded}
                  onToggle={fixedDesktopSidebar ? undefined : toggleRail}
                />
              </aside>

              {/* Mobile drawer */}
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetContent side="left" className="font-geist w-64 p-0">
                  <SheetTitle className="sr-only">Workspace</SheetTitle>
                  <AppSidebar showLabels onNavigate={() => setMobileOpen(false)} />
                </SheetContent>
              </Sheet>

              <div
                className={cn(
                  "transition-[padding] duration-300 ease-out",
                  desktopSidebarExpanded ? "lg:pl-62" : "lg:pl-16",
                )}
              >
                {/* Top bar */}
                <header className="sticky top-0 z-20 flex h-14 items-center gap-3 bg-background px-4 lg:px-6">
                  <button
                    type="button"
                    aria-label="Open menu"
                    onClick={() => setMobileOpen(true)}
                    className="rounded-md p-1.5 text-text-primary transition-colors hover:bg-dash-rail-hover focus-visible:outline-none lg:hidden"
                  >
                    <Menu className="h-5 w-5" />
                  </button>
                  <div className="flex-1" />
                  <NotificationBell />
                  <LineSwitcher />
                  <ProfileMenu />
                </header>

                <main className="w-full py-8">
                  <DashboardRouteGuard>{children}</DashboardRouteGuard>
                </main>
              </div>
            </div>
          </LoanCompareProvider>
        </RealEstateProvider>
      </LineProvider>
    </MeProvider>
  );
}
