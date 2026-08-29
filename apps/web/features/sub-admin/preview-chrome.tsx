import * as React from "react";

import { NAV_ITEMS } from "@/components/navbars/nav-items";
import { NAV_ITEMS as DASHBOARD_NAV_ITEMS } from "@/features/dashboard/nav-items";

/**
 * Page furniture drawn around a campaign preview so a Sub Admin sees the
 * banner or offer in the position a visitor will meet it.
 *
 * This is a static stand-in for `SiteHeader` and the dashboard shell rather
 * than those components themselves. Both depend on `usePathname`/`useRouter`
 * and open Radix portals, and a portal escapes the scaled `ViewportFrame`
 * container to paint over the authoring page at full size. Importing the same
 * `NAV_ITEMS`, the same dashboard nav entries and the same design tokens keeps
 * the labels and colours from drifting away from production without pulling
 * that behaviour in.
 */

const BRAND = "DhanaDhara";

const PUBLIC_NAV_LABELS = NAV_ITEMS.filter((item) => item.href !== "/").map((item) => item.label);

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2 font-heading text-lg font-semibold text-[var(--nav-text)]">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--nav-primary)] text-sm font-bold text-white">
        DD
      </span>
      <span className={compact ? "hidden sm:inline" : undefined}>{BRAND}</span>
    </span>
  );
}

export function PublicPreviewChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background">
      <header className="border-b border-[var(--nav-border)] bg-[var(--nav-bg)]">
        <div className="grid h-16 w-full grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6 lg:px-8">
          <BrandMark compact />
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

const DASHBOARD_RAIL_LABELS = DASHBOARD_NAV_ITEMS.filter((item) => item.section === "workspace")
  .slice(0, 6)
  .map((item) => item.label);

/**
 * The signed-in shell around a dashboard placement.
 *
 * `children` are rendered inside the same wrapper the real dashboard uses for
 * its highlights band (`personalized-placements.tsx`) -- `max-w-[1440px]` with
 * the same horizontal padding -- so a banner or offer card sits at the width it
 * will actually occupy instead of floating in an invented content area.
 */
export function DashboardPreviewChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[26rem] bg-background">
      <div className="flex h-14 items-center justify-between border-b border-[var(--dash-border)] bg-card px-4">
        <BrandMark />
        <span className="flex items-center gap-3">
          <span className="hidden text-sm text-text-secondary sm:inline">Dashboard</span>
          <span className="h-8 w-8 rounded-full bg-[var(--nav-tint)]" />
        </span>
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
        <main className="py-6">
          <section
            aria-label="Dashboard highlights"
            className="mx-auto mb-6 w-full max-w-[1440px] space-y-3 px-4 sm:px-6 lg:px-8"
          >
            {children}
          </section>
        </main>
      </div>
    </div>
  );
}
