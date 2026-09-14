import * as React from "react";
import HomeLoading from "@/app/(public)/loading";
import LoansLoading from "@/app/(public)/loans/loading";
import ServiceLoading from "@/app/(public)/loans/[slug]/loading";
import PropertiesLoading from "@/app/(public)/real-estate/loading";
import PropertyLoading from "@/app/(public)/real-estate/properties/[propertyId]/loading";
import ContactLoading from "@/app/(public)/contact/loading";
import PartnersLoading from "@/app/(public)/earn-with-us/loading";
import PartnerApplicationLoading from "@/app/(public)/apply-as-agent/loading";
import CalculatorsLoading from "@/app/(public)/calculators/loading";
import CalculatorLoading from "@/app/(public)/calculators/[slug]/loading";
import PrivacyLoading from "@/app/(public)/privacy/loading";
import TermsLoading from "@/app/(public)/terms/loading";
import CookiesLoading from "@/app/(public)/cookies/loading";
import InvitationLoading from "@/app/(public)/invite/[token]/loading";
import AuthLoading from "@/app/(auth)/loading";
import AppLoading from "@/app/(app)/loading";
import { AppShellSkeleton, DashboardPageSkeleton } from "@/features/dashboard/dashboard-page-skeleton";

// Actual route fallbacks, also exercised without a test-only application route.
export const loadingFallbacks = [
  { name: "home", path: "(public)/loading.tsx", element: React.createElement(HomeLoading) },
  { name: "loans", path: "(public)/loans/loading.tsx", element: React.createElement(LoansLoading) },
  { name: "financial-service", path: "(public)/loans/[slug]/loading.tsx", element: React.createElement(ServiceLoading) },
  { name: "properties", path: "(public)/real-estate/loading.tsx", element: React.createElement(PropertiesLoading) },
  { name: "property", path: "(public)/real-estate/properties/[propertyId]/loading.tsx", element: React.createElement(PropertyLoading) },
  { name: "contact", path: "(public)/contact/loading.tsx", element: React.createElement(ContactLoading) },
  { name: "partners", path: "(public)/earn-with-us/loading.tsx", element: React.createElement(PartnersLoading) },
  { name: "partner-application", path: "(public)/apply-as-agent/loading.tsx", element: React.createElement(PartnerApplicationLoading) },
  { name: "calculators", path: "(public)/calculators/loading.tsx", element: React.createElement(CalculatorsLoading) },
  { name: "calculator", path: "(public)/calculators/[slug]/loading.tsx", element: React.createElement(CalculatorLoading) },
  { name: "privacy", path: "(public)/privacy/loading.tsx", element: React.createElement(PrivacyLoading) },
  { name: "terms", path: "(public)/terms/loading.tsx", element: React.createElement(TermsLoading) },
  { name: "cookies", path: "(public)/cookies/loading.tsx", element: React.createElement(CookiesLoading) },
  { name: "invitation", path: "(public)/invite/[token]/loading.tsx", element: React.createElement(InvitationLoading) },
  { name: "auth", path: "(auth)/loading.tsx", element: React.createElement(AuthLoading) },
  { name: "dashboard-page", path: "(app)/loading.tsx", element: React.createElement(AppLoading) },
  { name: "dashboard-session", element: React.createElement(AppShellSkeleton) },
  { name: "dashboard-overview", element: React.createElement(DashboardPageSkeleton, { overview: true }) },
];
