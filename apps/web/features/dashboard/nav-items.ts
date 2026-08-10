import type { LucideIcon } from "lucide-react";

import type {
  BusinessLine,
  StaffBusinessLine,
  StaffFeature,
  UserRole,
} from "@/lib/auth";

import { DASHBOARD_ICONS } from "./dashboard-icons";

const ALL_ROLES: readonly UserRole[] = [
  "admin",
  "sub_admin",
  "agent",
  "telecaller",
  "employee",
  "client",
];

const CAPABILITIES = {
  shared: { roles: ALL_ROLES },
  client: { roles: ["client"] },
  clientLoans: { roles: ["client"], lines: ["loans"] },
  clientRealEstate: { roles: ["client"], lines: ["real_estate"] },
  transactions: { roles: ["client", "agent"] },
  agent: { roles: ["agent"] },
  agentRealEstate: { roles: ["agent"], lines: ["real_estate"] },
  telecaller: { roles: ["telecaller"] },
  employee: { roles: ["employee"] },
  employeeRealEstate: { roles: ["employee"], lines: ["real_estate"] },
  subAdmin: { roles: ["sub_admin"] },
  admin: { roles: ["admin"] },
  payouts: { roles: ["admin", "sub_admin"], staffFeature: "payout_requests" },
  cms: { roles: ["sub_admin", "admin"] },
  referralRules: { roles: ["sub_admin", "admin"] },
  realEstateSubmitter: {
    roles: ["client", "agent"],
    lines: ["real_estate"],
  },
} as const satisfies Record<
  string,
  {
    roles: readonly UserRole[];
    lines?: readonly BusinessLine[];
    staffFeature?: StaffFeature;
  }
>;

export type DashboardCapability = keyof typeof CAPABILITIES;
export type NavSectionKey =
  | "workspace"
  | "operations"
  | "people"
  | "finance"
  | "content"
  | "insights";

export type DashboardAccessContext = {
  role: UserRole;
  businessLine: StaffBusinessLine | null;
  activeLine?: BusinessLine;
  profileLines?: readonly BusinessLine[];
  staffFeatures?: readonly StaffFeature[];
};

export type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  capability: DashboardCapability;
  section: NavSectionKey;
};

export type NavSection = {
  key: NavSectionKey;
  label: string | null;
  items: NavItem[];
};

const SECTION_META: readonly {
  key: NavSectionKey;
  label: string | null;
}[] = [
  { key: "workspace", label: null },
  { key: "operations", label: "Operations" },
  { key: "people", label: "People & access" },
  { key: "finance", label: "Finance" },
  { key: "content", label: "Content" },
  { key: "insights", label: "Insights" },
];

// One navigation catalogue for all six dashboards. Capability definitions own
// role and line eligibility; the sidebar only renders the result. API
// dependencies and PostgreSQL RLS remain the authorization boundary.
export const NAV_ITEMS: readonly NavItem[] = [
  {
    key: "home",
    label: "Home",
    href: "/dashboard",
    icon: DASHBOARD_ICONS.home,
    capability: "shared",
    section: "workspace",
  },

  // Client workspace. The active line filters the line-specific entries.
  {
    key: "explore",
    label: "Explore",
    href: "/dashboard/explore",
    icon: DASHBOARD_ICONS.explore,
    capability: "client",
    section: "workspace",
  },
  {
    key: "apply",
    label: "Apply for a loan",
    href: "/dashboard/apply",
    icon: DASHBOARD_ICONS.applyForLoan,
    capability: "clientLoans",
    section: "workspace",
  },
  {
    key: "documents",
    label: "Loan media",
    href: "/dashboard/documents",
    icon: DASHBOARD_ICONS.loanMedia,
    capability: "clientLoans",
    section: "workspace",
  },
  {
    key: "loan-offers",
    label: "Compare Loan Offers",
    href: "/dashboard/loan-offers",
    icon: DASHBOARD_ICONS.compare,
    capability: "clientLoans",
    section: "workspace",
  },
  {
    key: "loan-officer",
    label: "My Loan Officer",
    href: "/dashboard/loan-officer",
    icon: DASHBOARD_ICONS.loanOfficer,
    capability: "clientLoans",
    section: "workspace",
  },
  {
    key: "bookmarks",
    label: "Bookmarks",
    href: "/dashboard/bookmarks",
    icon: DASHBOARD_ICONS.bookmarks,
    capability: "clientRealEstate",
    section: "workspace",
  },
  {
    key: "enquiries",
    label: "My Enquiries",
    href: "/dashboard/enquiries",
    icon: DASHBOARD_ICONS.enquiries,
    capability: "clientRealEstate",
    section: "workspace",
  },
  {
    key: "site-visits",
    label: "Site Visits",
    href: "/dashboard/site-visits",
    icon: DASHBOARD_ICONS.siteVisits,
    capability: "clientRealEstate",
    section: "workspace",
  },
  {
    key: "compare",
    label: "Compare",
    href: "/dashboard/compare",
    icon: DASHBOARD_ICONS.compare,
    capability: "clientRealEstate",
    section: "workspace",
  },
  {
    key: "client-agent",
    label: "My Agent",
    href: "/dashboard/agent",
    icon: DASHBOARD_ICONS.agent,
    capability: "clientRealEstate",
    section: "workspace",
  },
  {
    key: "client-listings",
    label: "My Listings",
    href: "/dashboard/my-submissions",
    icon: DASHBOARD_ICONS.propertyListings,
    capability: "clientRealEstate",
    section: "workspace",
  },
  {
    key: "client-transactions",
    label: "Transactions",
    href: "/dashboard/transactions",
    icon: DASHBOARD_ICONS.transactions,
    capability: "client",
    section: "workspace",
  },
  {
    key: "client-referrals",
    label: "Referrals",
    href: "/dashboard/referrals",
    icon: DASHBOARD_ICONS.referrals,
    capability: "client",
    section: "workspace",
  },

  // Agent, Telecaller, and Employee workspaces.
  {
    key: "telecaller-leads",
    label: "Leads",
    href: "/dashboard/leads",
    icon: DASHBOARD_ICONS.leads,
    capability: "telecaller",
    section: "operations",
  },
  {
    key: "employee-tasks",
    label: "Tasks",
    href: "/dashboard/tasks",
    icon: DASHBOARD_ICONS.tasks,
    capability: "employee",
    section: "operations",
  },
  {
    key: "employee-vehicle-arrangements",
    label: "Vehicle arrangements",
    href: "/dashboard/vehicle-arrangements",
    icon: DASHBOARD_ICONS.vehicleArrangements,
    capability: "employeeRealEstate",
    section: "operations",
  },
  {
    key: "agent-leads",
    label: "Leads",
    href: "/dashboard/leads",
    icon: DASHBOARD_ICONS.leads,
    capability: "agent",
    section: "operations",
  },
  {
    key: "agent-listings",
    label: "Listings",
    href: "/dashboard/my-submissions",
    icon: DASHBOARD_ICONS.propertyListings,
    capability: "agentRealEstate",
    section: "operations",
  },
  {
    key: "agent-earnings",
    label: "Earnings",
    href: "/dashboard/earnings",
    icon: DASHBOARD_ICONS.earnings,
    capability: "agent",
    section: "finance",
  },
  {
    key: "agent-transactions",
    label: "Transactions",
    href: "/dashboard/transactions",
    icon: DASHBOARD_ICONS.transactions,
    capability: "agent",
    section: "finance",
  },

  // Sub Admin surfaces.
  {
    key: "sub-admin-listings",
    label: "Property listings",
    href: "/dashboard/my-submissions",
    icon: DASHBOARD_ICONS.propertyListings,
    capability: "subAdmin",
    section: "operations",
  },
  {
    key: "sub-admin-referral-rules",
    label: "Referral rules",
    href: "/dashboard/referral-rules",
    icon: DASHBOARD_ICONS.referrals,
    capability: "subAdmin",
    section: "finance",
  },

  // Shared CMS views. Sub Admin authors; Admin reviews or oversees according
  // to the existing route/API behavior.
  {
    key: "banners",
    label: "Banners",
    href: "/dashboard/banners",
    icon: DASHBOARD_ICONS.banners,
    capability: "cms",
    section: "content",
  },
  {
    key: "offers",
    label: "Offers",
    href: "/dashboard/offers",
    icon: DASHBOARD_ICONS.offers,
    capability: "cms",
    section: "content",
  },
  {
    key: "content",
    label: "Website content",
    href: "/dashboard/content",
    icon: DASHBOARD_ICONS.websiteContent,
    capability: "cms",
    section: "content",
  },

  // Admin operations.
  {
    key: "admin-leads",
    label: "Lead assignments",
    href: "/dashboard/admin-leads",
    icon: DASHBOARD_ICONS.leads,
    capability: "admin",
    section: "operations",
  },
  {
    key: "admin-tasks",
    label: "Task assignments",
    href: "/dashboard/admin-tasks",
    icon: DASHBOARD_ICONS.tasks,
    capability: "admin",
    section: "operations",
  },
  {
    key: "admin-loans",
    label: "Loan applications",
    href: "/dashboard/loan-applications",
    icon: DASHBOARD_ICONS.loanApplications,
    capability: "admin",
    section: "operations",
  },
  {
    key: "admin-loan-config",
    label: "Loan configuration",
    href: "/dashboard/loan-config",
    icon: DASHBOARD_ICONS.loanConfiguration,
    capability: "admin",
    section: "operations",
  },
  {
    key: "admin-deals",
    label: "Property deals",
    href: "/dashboard/property-deals",
    icon: DASHBOARD_ICONS.propertyDeals,
    capability: "admin",
    section: "operations",
  },
  {
    key: "admin-vehicle-arrangements",
    label: "Vehicle arrangements",
    href: "/dashboard/vehicle-arrangements",
    icon: DASHBOARD_ICONS.vehicleArrangements,
    capability: "admin",
    section: "operations",
  },
  {
    key: "admin-property-review",
    label: "Listing approvals",
    href: "/dashboard/property-review",
    icon: DASHBOARD_ICONS.listingApprovals,
    capability: "admin",
    section: "operations",
  },
  {
    key: "admin-document-verification",
    label: "Document verification",
    href: "/dashboard/document-verification",
    icon: DASHBOARD_ICONS.documentVerification,
    capability: "admin",
    section: "operations",
  },

  // Admin people, security, finance, content, and reporting.
  {
    key: "admin-users",
    label: "Users & staff",
    href: "/dashboard/users",
    icon: DASHBOARD_ICONS.usersAndStaff,
    capability: "admin",
    section: "people",
  },
  {
    key: "admin-agents",
    label: "Agent applications",
    href: "/dashboard/agents",
    icon: DASHBOARD_ICONS.agentApplications,
    capability: "admin",
    section: "people",
  },
  {
    key: "admin-support-tickets",
    label: "Support tickets",
    href: "/dashboard/support-tickets",
    icon: DASHBOARD_ICONS.supportTickets,
    capability: "admin",
    section: "people",
  },
  {
    key: "admin-access-control",
    label: "Access control",
    href: "/dashboard/access-control",
    icon: DASHBOARD_ICONS.accessControl,
    capability: "admin",
    section: "people",
  },
  {
    key: "admin-payouts",
    label: "Payouts",
    href: "/dashboard/payouts",
    icon: DASHBOARD_ICONS.payouts,
    capability: "payouts",
    section: "finance",
  },
  {
    key: "admin-commissions",
    label: "Commissions",
    href: "/dashboard/commissions",
    icon: DASHBOARD_ICONS.commissions,
    capability: "admin",
    section: "finance",
  },
  {
    key: "admin-fee-cashbacks",
    label: "Fee cashbacks",
    href: "/dashboard/fee-cashbacks",
    icon: DASHBOARD_ICONS.feeCashbacks,
    capability: "admin",
    section: "finance",
  },
  {
    key: "admin-referral-payouts",
    label: "Referral payouts",
    href: "/dashboard/referral-payouts",
    icon: DASHBOARD_ICONS.referrals,
    capability: "admin",
    section: "finance",
  },
  {
    key: "admin-referral-rules",
    label: "Referral rules",
    href: "/dashboard/referral-rules",
    icon: DASHBOARD_ICONS.referrals,
    capability: "admin",
    section: "finance",
  },
  {
    key: "admin-broadcast",
    label: "Broadcast",
    href: "/dashboard/broadcast",
    icon: DASHBOARD_ICONS.broadcast,
    capability: "admin",
    section: "content",
  },
  {
    key: "admin-analytics",
    label: "Analytics",
    href: "/dashboard/analytics",
    icon: DASHBOARD_ICONS.analytics,
    capability: "admin",
    section: "insights",
  },
  {
    key: "admin-audit-log",
    label: "Audit log",
    href: "/dashboard/audit-log",
    icon: DASHBOARD_ICONS.auditLog,
    capability: "admin",
    section: "insights",
  },
];

export type DashboardRouteRule = {
  path: string;
  exact?: boolean;
  capabilities: readonly DashboardCapability[];
};

// Specific child routes must precede their parent prefix. For example, an
// Admin can view /banners but only a Sub Admin can author /banners/new.
export const DASHBOARD_ROUTE_RULES: readonly DashboardRouteRule[] = [
  { path: "/dashboard", exact: true, capabilities: ["shared"] },
  { path: "/dashboard/banners/new", exact: true, capabilities: ["subAdmin"] },
  { path: "/dashboard/content/new", exact: true, capabilities: ["subAdmin"] },
  { path: "/dashboard/leads/new", exact: true, capabilities: ["agent"] },
  { path: "/dashboard/offers/new", exact: true, capabilities: ["subAdmin"] },
  { path: "/dashboard/access-control", exact: true, capabilities: ["admin"] },
  { path: "/dashboard/admin-leads", exact: true, capabilities: ["admin"] },
  { path: "/dashboard/admin-tasks", exact: true, capabilities: ["admin"] },
  { path: "/dashboard/agent", exact: true, capabilities: ["clientRealEstate"] },
  { path: "/dashboard/agents", exact: true, capabilities: ["admin"] },
  { path: "/dashboard/analytics", exact: true, capabilities: ["admin"] },
  { path: "/dashboard/apply", exact: true, capabilities: ["clientLoans"] },
  { path: "/dashboard/audit-log", exact: true, capabilities: ["admin"] },
  { path: "/dashboard/banners", capabilities: ["cms"] },
  { path: "/dashboard/bookmarks", exact: true, capabilities: ["clientRealEstate"] },
  { path: "/dashboard/broadcast", exact: true, capabilities: ["admin"] },
  { path: "/dashboard/commissions", exact: true, capabilities: ["admin"] },
  { path: "/dashboard/compare", exact: true, capabilities: ["clientRealEstate"] },
  { path: "/dashboard/content", capabilities: ["cms"] },
  { path: "/dashboard/documents", exact: true, capabilities: ["clientLoans"] },
  {
    path: "/dashboard/document-verification",
    exact: true,
    capabilities: ["admin"],
  },
  { path: "/dashboard/earnings", exact: true, capabilities: ["agent"] },
  { path: "/dashboard/enquiries", exact: true, capabilities: ["clientRealEstate"] },
  { path: "/dashboard/explore", capabilities: ["client"] },
  { path: "/dashboard/fee-cashbacks", exact: true, capabilities: ["admin"] },
  { path: "/dashboard/leads", capabilities: ["agent", "telecaller"] },
  { path: "/dashboard/loan-applications", exact: true, capabilities: ["admin"] },
  { path: "/dashboard/loan-config", exact: true, capabilities: ["admin"] },
  { path: "/dashboard/loan-offers", exact: true, capabilities: ["clientLoans"] },
  { path: "/dashboard/loan-officer", exact: true, capabilities: ["clientLoans"] },
  { path: "/dashboard/loans", capabilities: ["clientLoans"] },
  {
    path: "/dashboard/my-submissions",
    exact: true,
    capabilities: ["realEstateSubmitter", "subAdmin"],
  },
  { path: "/dashboard/notifications", exact: true, capabilities: ["shared"] },
  { path: "/dashboard/offers", capabilities: ["cms"] },
  { path: "/dashboard/payouts", exact: true, capabilities: ["payouts"] },
  { path: "/dashboard/property-deals", exact: true, capabilities: ["admin"] },
  { path: "/dashboard/property-review", exact: true, capabilities: ["admin"] },
  {
    path: "/dashboard/property-submit",
    exact: true,
    capabilities: ["realEstateSubmitter", "subAdmin"],
  },
  { path: "/dashboard/referral-payouts", exact: true, capabilities: ["admin"] },
  {
    path: "/dashboard/referral-rules",
    exact: true,
    capabilities: ["referralRules"],
  },
  { path: "/dashboard/referrals", exact: true, capabilities: ["client"] },
  { path: "/dashboard/settings", exact: true, capabilities: ["shared"] },
  { path: "/dashboard/site-visits", exact: true, capabilities: ["clientRealEstate"] },
  { path: "/dashboard/support", exact: true, capabilities: ["shared"] },
  { path: "/dashboard/support-tickets", exact: true, capabilities: ["admin"] },
  { path: "/dashboard/tasks", capabilities: ["employee"] },
  { path: "/dashboard/transactions", exact: true, capabilities: ["transactions"] },
  { path: "/dashboard/users", exact: true, capabilities: ["admin"] },
  {
    path: "/dashboard/vehicle-arrangements",
    exact: true,
    capabilities: ["employeeRealEstate", "admin"],
  },
];

function hasCapability(
  capability: DashboardCapability,
  context: DashboardAccessContext,
  useProfileLines: boolean,
): boolean {
  const access = CAPABILITIES[capability];
  if (!(access.roles as readonly UserRole[]).includes(context.role)) return false;
  if (
    context.role === "sub_admin" &&
    "staffFeature" in access &&
    !context.staffFeatures?.includes(access.staffFeature)
  ) {
    return false;
  }
  if (!("lines" in access)) return true;

  const allowedLines = access.lines as readonly BusinessLine[];
  if (context.role !== "client") {
    const line = context.businessLine === "both" ? context.activeLine : context.businessLine;
    return line != null && allowedLines.includes(line);
  }

  if (!useProfileLines) {
    return context.activeLine != null && allowedLines.includes(context.activeLine);
  }

  // /auth/me failures must not become an accidental browser authorization
  // boundary. When the profile list is unavailable, let the API/RLS decide.
  if (context.profileLines === undefined) return true;
  return context.profileLines.some((line) => allowedLines.includes(line));
}

export function getNavigationSections(context: DashboardAccessContext): NavSection[] {
  const visible = NAV_ITEMS.filter((item) =>
    hasCapability(item.capability, context, false),
  );

  return SECTION_META.map((section) => ({
    ...section,
    items: visible.filter((item) => item.section === section.key),
  })).filter((section) => section.items.length > 0);
}

function matchesRoute(pathname: string, rule: DashboardRouteRule): boolean {
  if (rule.exact) return pathname === rule.path;
  return pathname === rule.path || pathname.startsWith(`${rule.path}/`);
}

export function findDashboardRouteRule(pathname: string): DashboardRouteRule | undefined {
  return DASHBOARD_ROUTE_RULES.find((rule) => matchesRoute(pathname, rule));
}

export function getDashboardPathLine(pathname: string): BusinessLine | null {
  const rule = findDashboardRouteRule(pathname);
  if (!rule) return null;

  const lines = new Set<BusinessLine>();
  for (const capability of rule.capabilities) {
    const access = CAPABILITIES[capability];
    if (!("lines" in access)) continue;
    for (const line of access.lines) lines.add(line);
  }
  return lines.size === 1 ? [...lines][0] : null;
}

export function isDashboardPathAllowed(
  pathname: string,
  context: DashboardAccessContext,
): boolean {
  if (!pathname.startsWith("/dashboard")) return true;
  const rule = findDashboardRouteRule(pathname);
  if (!rule) return false;
  return rule.capabilities.some((capability) =>
    hasCapability(capability, context, true),
  );
}
