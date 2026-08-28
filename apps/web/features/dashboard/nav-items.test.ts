import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type {
  BusinessLine,
  StaffBusinessLine,
  StaffFeature,
  UserRole,
} from "@/lib/auth";

import {
  NAV_ITEMS,
  findDashboardRouteRule,
  getDashboardPathLine,
  getNavigationSections,
  isDashboardPathAllowed,
  type DashboardAccessContext,
} from "./nav-items";
import { DASHBOARD_ICONS } from "./dashboard-icons";

function context(
  role: UserRole,
  businessLine: StaffBusinessLine | null = null,
  activeLine: BusinessLine = "loans",
  profileLines?: readonly BusinessLine[],
  staffFeatures?: readonly StaffFeature[],
): DashboardAccessContext {
  return { role, businessLine, activeLine, profileLines, staffFeatures };
}

function navKeys(access: DashboardAccessContext): string[] {
  return getNavigationSections(access).flatMap((section) =>
    section.items.map((item) => item.key),
  );
}

function dashboardPageRoutes(
  directory: string,
  segments: readonly string[] = [],
): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const routes: string[] = [];

  if (entries.some((entry) => entry.isFile() && entry.name === "page.tsx")) {
    const routeSegments = segments.map((segment) =>
      segment.startsWith("[") ? "example-id" : segment,
    );
    routes.push(`/dashboard${routeSegments.length > 0 ? `/${routeSegments.join("/")}` : ""}`);
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    routes.push(
      ...dashboardPageRoutes(path.join(directory, entry.name), [...segments, entry.name]),
    );
  }

  return routes;
}

describe("role-aware dashboard navigation", () => {
  it("uses one canonical icon for concepts repeated across role dashboards", () => {
    const iconsFor = (href: string) =>
      NAV_ITEMS.filter((item) => item.href === href).map((item) => item.icon);

    expect(iconsFor("/dashboard/leads")).toEqual([
      DASHBOARD_ICONS.leads,
      DASHBOARD_ICONS.leads,
    ]);
    expect(iconsFor("/dashboard/my-submissions")).toEqual([
      DASHBOARD_ICONS.propertyListings,
      DASHBOARD_ICONS.propertyListings,
      DASHBOARD_ICONS.propertyListings,
    ]);
    expect(iconsFor("/dashboard/referral-rules")).toEqual([
      DASHBOARD_ICONS.referrals,
      DASHBOARD_ICONS.referrals,
    ]);
    expect(iconsFor("/dashboard/vehicle-arrangements")).toEqual([
      DASHBOARD_ICONS.vehicleArrangements,
      DASHBOARD_ICONS.vehicleArrangements,
    ]);
  });

  it("keeps Client Loans and Real Estate features separate", () => {
    expect(navKeys(context("client", null, "loans"))).toEqual([
      "home",
      "explore",
      "documents",
      "loan-offers",
      "loan-officer",
      "client-transactions",
      "client-referrals",
    ]);

    expect(navKeys(context("client", null, "real_estate"))).toEqual([
      "home",
      "explore",
      "bookmarks",
      "enquiries",
      "site-visits",
      "compare",
      "client-agent",
      "client-transactions",
      "client-referrals",
    ]);
  });

  it("shows only each Agent, Telecaller, and Employee work surface", () => {
    expect(navKeys(context("agent", "loans"))).toEqual([
      "home",
      "agent-leads",
      "agent-earnings",
      "agent-transactions",
    ]);
    expect(navKeys(context("agent", "real_estate"))).toEqual([
      "home",
      "agent-leads",
      "agent-listings",
      "agent-earnings",
      "agent-transactions",
    ]);
    expect(navKeys(context("telecaller", "loans"))).toEqual([
      "home",
      "telecaller-leads",
    ]);
    expect(navKeys(context("employee", "loans"))).toEqual([
      "home",
      "employee-tasks",
    ]);
    expect(navKeys(context("employee", "real_estate"))).toEqual([
      "home",
      "employee-tasks",
      "employee-vehicle-arrangements",
    ]);
  });

  it("uses the selected line for dual-line Telecaller and Employee navigation", () => {
    expect(navKeys(context("telecaller", "both", "loans"))).toEqual([
      "home",
      "telecaller-leads",
    ]);
    expect(navKeys(context("employee", "both", "loans"))).toEqual([
      "home",
      "employee-tasks",
    ]);
    expect(navKeys(context("employee", "both", "real_estate"))).toEqual([
      "home",
      "employee-tasks",
      "employee-vehicle-arrangements",
    ]);
  });

  it("makes the supported Sub Admin surfaces reachable without Client items", () => {
    expect(navKeys(context("sub_admin"))).toEqual([
      "home",
      "sub-admin-listings",
      "sub-admin-listing-submit",
      "sub-admin-finance",
      "sub-admin-referral-rules",
      "banners",
      "offers",
    ]);

    expect(navKeys(context("sub_admin", null, "loans", undefined, ["payout_requests"]))).toEqual([
      "home",
      "sub-admin-listings",
      "sub-admin-listing-submit",
      "sub-admin-finance",
      "sub-admin-payouts",
      "sub-admin-referral-rules",
      "banners",
      "offers",
    ]);
  });

  it("makes every existing Admin workspace reachable in grouped navigation", () => {
    expect(navKeys(context("admin"))).toEqual([
      "home",
      "admin-leads",
      "admin-tasks",
      "admin-loans",
      "admin-loan-config",
      "admin-deals",
      "admin-vehicle-arrangements",
      "admin-property-listings",
      "admin-property-review",
      "admin-document-verification",
      "admin-users",
      "admin-agents",
      "admin-support-tickets",
      "admin-payouts",
      "admin-commissions",
      "admin-fee-cashbacks",
      "admin-referral-payouts",
      "admin-referral-rules",
      "banners",
      "offers",
      "admin-broadcast",
      "admin-banner-media",
      "admin-analytics",
    ]);
  });
});

describe("dashboard direct-route UX access", () => {
  it("covers every checked-in dashboard page with an explicit route rule", () => {
    const dashboardRoot = fileURLToPath(
      new URL("../../app/(app)/dashboard", import.meta.url),
    );
    const routes = dashboardPageRoutes(dashboardRoot);

    expect(routes.length).toBeGreaterThan(50);
    expect(routes.filter((route) => findDashboardRouteRule(route) === undefined)).toEqual([]);
  });

  it("uses held Client profiles for direct line-specific routes", () => {
    expect(getDashboardPathLine("/dashboard/loan-offers")).toBe("loans");
    expect(getDashboardPathLine("/dashboard/property-submit")).toBe("real_estate");
    expect(getDashboardPathLine("/dashboard/settings")).toBeNull();

    expect(
      isDashboardPathAllowed(
        "/dashboard/apply",
        context("client", null, "real_estate", ["loans", "real_estate"]),
      ),
    ).toBe(true);
    expect(
      isDashboardPathAllowed(
        "/dashboard/apply",
        context("client", null, "real_estate", ["real_estate"]),
      ),
    ).toBe(false);
    expect(
      isDashboardPathAllowed(
        "/dashboard/bookmarks",
        context("client", null, "loans", ["loans"]),
      ),
    ).toBe(false);
    expect(
      isDashboardPathAllowed(
        "/dashboard/properties/123e4567-e89b-42d3-a456-426614174000",
        context("client", null, "loans", ["loans"]),
      ),
    ).toBe(true);
  });

  it("keeps role-only and shared nested routes distinct", () => {
    expect(isDashboardPathAllowed("/dashboard/leads/example-id", context("telecaller", "loans"))).toBe(true);
    expect(isDashboardPathAllowed("/dashboard/leads/new", context("telecaller", "loans"))).toBe(false);
    expect(isDashboardPathAllowed("/dashboard/leads/new", context("agent", "loans"))).toBe(true);

    expect(isDashboardPathAllowed("/dashboard/banners", context("admin"))).toBe(true);
    expect(isDashboardPathAllowed("/dashboard/banners/new", context("admin"))).toBe(false);
    expect(isDashboardPathAllowed("/dashboard/banners/new", context("sub_admin"))).toBe(false);
    expect(isDashboardPathAllowed("/dashboard/offers/new", context("sub_admin"))).toBe(false);
    expect(isDashboardPathAllowed("/dashboard/banner-media", context("admin"))).toBe(true);
    expect(isDashboardPathAllowed("/dashboard/banner-media", context("sub_admin"))).toBe(false);
    expect(isDashboardPathAllowed("/dashboard/content", context("admin"))).toBe(false);
    expect(isDashboardPathAllowed("/dashboard/content", context("sub_admin"))).toBe(false);
    expect(isDashboardPathAllowed("/dashboard/audit-log", context("admin"))).toBe(true);
  });

  it("keeps Client and cross-line features out of staff workspaces", () => {
    expect(isDashboardPathAllowed("/dashboard/referrals", context("agent", "loans"))).toBe(false);
    expect(isDashboardPathAllowed("/dashboard/explore", context("employee", "real_estate"))).toBe(false);
    expect(
      isDashboardPathAllowed(
        "/dashboard/vehicle-arrangements",
        context("employee", "loans"),
      ),
    ).toBe(false);
    expect(
      isDashboardPathAllowed(
        "/dashboard/vehicle-arrangements",
        context("employee", "real_estate"),
      ),
    ).toBe(true);
    expect(isDashboardPathAllowed("/dashboard/vehicle-arrangements", context("admin"))).toBe(true);
  });

  it("allows only a granted Sub Admin to open payouts", () => {
    expect(isDashboardPathAllowed("/dashboard/payouts", context("sub_admin"))).toBe(false);
    expect(
      isDashboardPathAllowed(
        "/dashboard/payouts",
        context("sub_admin", null, "loans", undefined, ["payout_requests"]),
      ),
    ).toBe(true);
  });

  it("allows known shared pages and rejects unknown dashboard paths", () => {
    for (const role of [
      "admin",
      "sub_admin",
      "agent",
      "telecaller",
      "employee",
      "client",
    ] satisfies UserRole[]) {
      expect(isDashboardPathAllowed("/dashboard/notifications", context(role))).toBe(true);
      expect(isDashboardPathAllowed("/dashboard/settings", context(role))).toBe(true);
    }
    expect(isDashboardPathAllowed("/dashboard/not-a-real-page", context("admin"))).toBe(false);
    expect(isDashboardPathAllowed("/contact", context("client"))).toBe(true);
  });

  it("keeps the Admin-only Operational Records route guarded but out of navigation", () => {
    expect(navKeys(context("admin"))).not.toContain("admin-operational-records");
    expect(isDashboardPathAllowed("/dashboard/operations", context("admin"))).toBe(true);
    expect(isDashboardPathAllowed("/dashboard/operations", context("sub_admin"))).toBe(false);
  });
});
