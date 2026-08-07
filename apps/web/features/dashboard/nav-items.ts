import {
  ArrowLeftRight,
  Bookmark,
  Building2,
  CalendarCheck,
  CarFront,
  ClipboardList,
  FilePlus2,
  FolderClosed,
  Gift,
  House,
  IndianRupee,
  Landmark,
  MessageSquare,
  PhoneCall,
  Scale,
  Telescope,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  // Loans-only surfaces. Hidden when the workspace is on the real-estate line so
  // a loans feature is never offered under the real-estate accent.
  loansOnly?: boolean;
  // Real-estate-only surfaces. Hidden on the loans line for the same reason.
  realEstateOnly?: boolean;
  // Telecaller-only surface. Shown alongside Home for role=telecaller, hidden
  // for every other role (mirrors how loansOnly/realEstateOnly gate the client rail).
  telecallerOnly?: boolean;
  // Employee-only surface. Shown alongside Home for role=employee, hidden for
  // every other role (same pattern as telecallerOnly).
  employeeOnly?: boolean;
  // Agent-only surface. Shown alongside Home for role=agent, hidden for
  // every other role (same pattern as telecallerOnly/employeeOnly).
  agentOnly?: boolean;
  // Admin-only surface. Shown alongside Home for role=admin, hidden for
  // every other role (same pattern as telecallerOnly/employeeOnly/agentOnly).
  // Only the two stateful pipelines earn a rail slot; Admin's approval
  // surfaces (agents, banners, property-review) are reached from the Home
  // queue, which shows live counts a rail icon cannot.
  adminOnly?: boolean;
};

// Slim workspace rail. Near-white chrome, icon-only with tooltips on desktop.
// Icons are gray and turn blue on hover; the active item shows a blue icon plus
// a left indicator bar (set in app-sidebar). Home, Transactions and Referrals
// show for both lines; Apply and Documents are loans-only; Bookmarks/Enquiries/
// Site Visits/Compare/My Agent are real-estate-only. Notifications live in the
// top bar, Support + Profile in the account menu; identity sits in the rail's
// bottom block.
export const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "Home", href: "/dashboard", icon: House },
  { key: "explore", label: "Explore", href: "/dashboard/explore", icon: Telescope },
  { key: "apply", label: "Apply for a loan", href: "/dashboard/apply", icon: FilePlus2, loansOnly: true },
  { key: "documents", label: "Documents", href: "/dashboard/documents", icon: FolderClosed, loansOnly: true },
  { key: "loan-offers", label: "Compare Loan Offers", href: "/dashboard/loan-offers", icon: Scale, loansOnly: true },
  { key: "loan-officer", label: "My Loan Officer", href: "/dashboard/loan-officer", icon: UserRound, loansOnly: true },
  { key: "bookmarks", label: "Bookmarks", href: "/dashboard/bookmarks", icon: Bookmark, realEstateOnly: true },
  { key: "enquiries", label: "My Enquiries", href: "/dashboard/enquiries", icon: MessageSquare, realEstateOnly: true },
  { key: "site-visits", label: "Site Visits", href: "/dashboard/site-visits", icon: CalendarCheck, realEstateOnly: true },
  { key: "compare", label: "Compare", href: "/dashboard/compare", icon: Scale, realEstateOnly: true },
  { key: "agent", label: "My Agent", href: "/dashboard/agent", icon: UserRound, realEstateOnly: true },
  { key: "transactions", label: "Transactions", href: "/dashboard/transactions", icon: ArrowLeftRight },
  { key: "referrals", label: "Referrals", href: "/dashboard/referrals", icon: Gift },
  { key: "leads", label: "Leads", href: "/dashboard/leads", icon: PhoneCall, telecallerOnly: true },
  { key: "tasks", label: "Tasks", href: "/dashboard/tasks", icon: ClipboardList, employeeOnly: true },
  {
    key: "employee-vehicle-arrangements",
    label: "Vehicle arrangements",
    href: "/dashboard/vehicle-arrangements",
    icon: CarFront,
    employeeOnly: true,
    realEstateOnly: true,
  },
  { key: "agent-leads", label: "Leads", href: "/dashboard/leads", icon: PhoneCall, agentOnly: true },
  {
    key: "agent-listings",
    label: "Listings",
    href: "/dashboard/my-submissions",
    icon: Building2,
    agentOnly: true,
    realEstateOnly: true,
  },
  { key: "agent-earnings", label: "Earnings", href: "/dashboard/earnings", icon: IndianRupee, agentOnly: true },
  {
    key: "admin-loans",
    label: "Loan applications",
    href: "/dashboard/loan-applications",
    icon: Landmark,
    adminOnly: true,
  },
  {
    key: "admin-deals",
    label: "Property deals",
    href: "/dashboard/property-deals",
    icon: Building2,
    adminOnly: true,
  },
  {
    key: "admin-vehicle-arrangements",
    label: "Vehicle arrangements",
    href: "/dashboard/vehicle-arrangements",
    icon: CarFront,
    adminOnly: true,
  },
];
