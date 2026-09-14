"use client";

import * as React from "react";
import { Menu } from "lucide-react";
import { Logo } from "@/components/logo";

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
import { NotificationsProvider } from "./notifications-provider";
import { ProfileMenu } from "./profile-menu";
import { hasFixedDesktopSidebar, isDesktopSidebarExpanded } from "./shell-state";

// Authenticated dashboard shell: Clients get a collapsible icon rail that
// always starts collapsed (session-only expand/collapse, not remembered
// across reloads), while operational roles use an always-labeled desktop
// sidebar. Every role gets the same mobile drawer and a top bar with
// line/account utilities.
export function AppShell({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const mobileTriggerRef = React.useRef<HTMLButtonElement>(null);
  const [railOpen, setRailOpen] = React.useState(false);
  const fixedDesktopSidebar = hasFixedDesktopSidebar(session?.role);
  const desktopSidebarExpanded = isDesktopSidebarExpanded(session?.role, railOpen);

  const toggleRail = React.useCallback(() => {
    setRailOpen((open) => !open);
  }, []);

  return (
    <MeProvider>
      <LineProvider>
        <RealEstateProvider>
          <LoanCompareProvider>
            <NotificationsProvider>
              <div
                className={cn(
                  "font-geist min-h-dvh bg-background transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none lg:grid",
                  desktopSidebarExpanded ? "lg:grid-cols-[15.5rem_minmax(0,1fr)]" : "lg:grid-cols-[4rem_minmax(0,1fr)]",
                )}
              >
                <a
                  href="#dashboard-main-content"
                  className="fixed left-4 top-4 z-[60] -translate-y-24 rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-surface shadow-lg transition-transform duration-150 ease-out focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 motion-reduce:transition-none"
                >
                  Skip to main content
                </a>
              {/* The grid stretches the rail with the page; only its navigation
                  stays in the viewport. Width and content offset share one track. */}
              <aside className="relative z-30 hidden min-w-0 bg-dash-rail lg:block">
                <div className="sticky top-0 h-dvh min-h-0">
                  <AppSidebar
                    expanded={desktopSidebarExpanded}
                    onToggle={fixedDesktopSidebar ? undefined : toggleRail}
                  />
                </div>
              </aside>

              {/* Mobile drawer */}
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetContent
                  side="left"
                  className="font-geist h-dvh w-64 border-white/15 bg-dash-rail p-0 text-dash-foreground"
                  closeButtonClassName="text-dash-foreground hover:bg-dash-rail-hover focus-visible:ring-brand-sky"
                  onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    mobileTriggerRef.current?.focus();
                  }}
                >
                  <SheetTitle className="sr-only">Workspace</SheetTitle>
                  <AppSidebar showLabels onNavigate={() => setMobileOpen(false)} />
                </SheetContent>
              </Sheet>

              <div className="min-w-0">
                {/* Top bar */}
                <header className="sticky top-0 z-20 flex min-h-16 items-center gap-0.5 border-b border-border bg-surface px-2 sm:gap-3 sm:px-4 lg:px-6">
                  <button
                    ref={mobileTriggerRef}
                    type="button"
                    aria-label="Open menu"
                    onClick={() => setMobileOpen(true)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-brand-navy transition-[background-color,color,transform] duration-150 ease-out hover:bg-brand-cta-tint active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue motion-reduce:transition-none motion-reduce:active:scale-100 lg:hidden"
                  >
                    <Menu className="h-5 w-5" />
                  </button>
                  <Logo variant="symbol" tone="navy" href="/dashboard" className="h-11 w-8 lg:hidden" sizes="32px" />
                  <div className="flex-1" />
                  <NotificationBell />
                  <LineSwitcher />
                  <ProfileMenu />
                </header>

                <main id="dashboard-main-content" tabIndex={-1} className="min-w-0 w-full py-5 sm:py-8">
                  <DashboardRouteGuard>{children}</DashboardRouteGuard>
                </main>
              </div>
              </div>
            </NotificationsProvider>
          </LoanCompareProvider>
        </RealEstateProvider>
      </LineProvider>
    </MeProvider>
  );
}
