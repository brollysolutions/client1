"use client";

import * as React from "react";
import { Menu } from "lucide-react";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

import { AppSidebar } from "./app-sidebar";
import { LineProvider } from "./line-provider";
import { LineSwitcher } from "./line-switcher";
import { MeProvider } from "./me-provider";
import { ProfileMenu } from "./profile-menu";

// Authenticated dashboard shell: a slim warm-gray icon rail on desktop, a drawer
// on mobile, and a top bar holding the line switcher + account menu on the right.
// No navy panel, no logo/wordmark. MeProvider + LineProvider wrap everything so
// the rail, switcher, and account menu share one /auth/me fetch and one active
// line. `font-geist` scopes Geist to the (app) subtree.
export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <MeProvider>
      <LineProvider>
        <div className="font-geist min-h-screen bg-background">
          {/* Desktop rail */}
          <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 lg:block">
            <AppSidebar />
          </aside>

          {/* Mobile drawer */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetContent side="left" className="font-geist w-64 p-0">
              <SheetTitle className="sr-only">Loans workspace</SheetTitle>
              <AppSidebar showLabels onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="lg:pl-16">
            {/* Top bar */}
            <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-dash-border bg-dash-rail px-4 lg:px-6">
              <button
                type="button"
                aria-label="Open menu"
                onClick={() => setMobileOpen(true)}
                className="rounded-md p-1.5 text-text-primary transition-colors hover:bg-dash-rail-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="flex-1" />
              <LineSwitcher />
              <ProfileMenu />
            </header>

            <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-10">{children}</main>
          </div>
        </div>
      </LineProvider>
    </MeProvider>
  );
}
