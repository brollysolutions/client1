"use client";

import * as React from "react";
import { Menu } from "lucide-react";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { LoanCompareProvider } from "@/features/loans/loan-offers-store";
import { RealEstateProvider } from "@/features/real-estate/store";
import { cn } from "@/lib/utils";

import { AppSidebar } from "./app-sidebar";
import { LineProvider } from "./line-provider";
import { LineSwitcher } from "./line-switcher";
import { MeProvider } from "./me-provider";
import { NotificationBell } from "./notification-bell";
import { ProfileMenu } from "./profile-menu";

const RAIL_OPEN_KEY = "dashboard:rail-open";

// Authenticated dashboard shell: a slim icon rail on desktop that expands to a
// labeled sidebar from the logo toggle, a drawer on mobile, and a top bar holding
// the line switcher + account menu on the right. MeProvider + LineProvider wrap
// everything so the rail, switcher, and account menu share one /auth/me fetch and
// one active line. `font-geist` scopes Geist to the (app) subtree.
export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [railOpen, setRailOpen] = React.useState(false);

  // Restore the desktop rail state after mount (kept out of the initializer so
  // SSR and first paint always agree on the collapsed default).
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setRailOpen(window.localStorage.getItem(RAIL_OPEN_KEY) === "1");
  }, []);

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
                  railOpen ? "w-62" : "w-16",
                )}
              >
                <AppSidebar expanded={railOpen} onToggle={toggleRail} />
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
                  railOpen ? "lg:pl-62" : "lg:pl-16",
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

                <main className="w-full py-8">{children}</main>
              </div>
            </div>
          </LoanCompareProvider>
        </RealEstateProvider>
      </LineProvider>
    </MeProvider>
  );
}
