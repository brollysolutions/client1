import * as React from "react";

import { NAV_ITEMS } from "@/components/navbars/nav-items";
import { NAV_ITEMS as DASHBOARD_NAV_ITEMS } from "@/features/dashboard/nav-items";

/**
 * Page furniture drawn around a campaign preview so a Sub Admin sees the
 * banner in the position a visitor will meet it.
 *
 * This is a static stand-in for `SiteHeader` and the dashboard shell rather
 * than those components themselves. Both depend on `usePathname`/`useRouter`
 * and open Radix portals, and a portal escapes the scaled `ViewportFrame`
 * container to paint over the authoring page at full size. Importing the same
 * `NAV_ITEMS`, the same dashboard nav entries and the same design tokens keeps
 * the labels and colours from drifting away from production without pulling
 * that behaviour in.
 *
 * What it replaces was worse than a stand-in: a hand-typed nav bar, an
 * invented "Login" pill and three grey skeleton blocks on a hardcoded cream
 * that was not the real page background.
 */

const PUBLIC_NAV_LABELS = NAV_ITEMS.filter((item) => item.href !== "/").map((item) => item.label);

export function PublicPreviewChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background">
      <header className="border-b border-[var(--nav-border)] bg-[var(--nav-bg)]">
        <div className="grid h-16 w-full grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 font-heading text-lg font-semibold text-[var(--nav-text)]">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--nav-primary)] text-sm font-bold text-white">
              LR
            </span>
            <span className="hidden sm:inline">Loans &amp; Real Estate</span>
          </div>
          <nav className="hidden items-center gap-1 lg:flex">
            {PUBLIC_NAV_LABELS.map((label) => (
              <span
                key={label}
                className="inline-flex h-9 items-center rounded-md px-3 text-base font-medium text-[var(--nav-text)]"
              >
                {label}
              </span>
            ))}
          </nav>
          <div className="flex items-center justify-end gap-2">
            <span className="hidden h-9 items-center rounded-md px-3 text-base font-medium text-[var(--nav-text)] sm:inline-flex">
              Contact
            </span>
            <span className="inline-flex h-9 items-center rounded-md bg-[var(--nav-primary)] px-4 text-sm font-semibold text-white">
              Register
            </span>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

const DASHBOARD_RAIL_LABELS = DASHBOARD_NAV_ITEMS.filter(
  (item) => item.section === "workspace",
)
  .slice(0, 6)
  .map((item) => item.label);

export function DashboardPreviewChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background">
      <div className="flex h-14 items-center justify-between border-b border-[var(--dash-border)] bg-card px-4">
        <span className="font-heading text-base font-semibold text-text-primary">
          Loans &amp; Real Estate
        </span>
        <span className="h-8 w-8 rounded-full bg-[var(--nav-tint)]" />
      </div>
      <div className="grid grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="space-y-1 border-r border-[var(--dash-border)] bg-[var(--color-dash-rail)] p-3">
          {DASHBOARD_RAIL_LABELS.map((label, index) => (
            <span
              key={label}
              className={`block truncate rounded-lg px-3 py-2 text-sm ${
                index === 0
                  ? "bg-[var(--nav-tint)] font-medium text-[var(--nav-primary)]"
                  : "text-text-secondary"
              }`}
            >
              {label}
            </span>
          ))}
        </aside>
        <main className="space-y-4 p-5">{children}</main>
      </div>
    </div>
  );
}
