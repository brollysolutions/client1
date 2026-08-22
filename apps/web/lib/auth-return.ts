import { isSafeLocalHref } from "@/lib/safe-local-href";
import type { ServiceLine } from "@/lib/auth";

const PROPERTY_RETURN_PATH =
  /^\/dashboard\/properties\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function dashboardReturnTo(requested: string | null): string {
  if (!requested || !isSafeLocalHref(requested)) return "/dashboard";
  const url = new URL(requested, "https://dhanadhara.invalid");
  if (url.pathname !== "/dashboard" && !url.pathname.startsWith("/dashboard/")) {
    return "/dashboard";
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function isPropertyReturnTo(returnTo: string): boolean {
  if (!isSafeLocalHref(returnTo)) return false;
  const url = new URL(returnTo, "https://dhanadhara.invalid");
  return PROPERTY_RETURN_PATH.test(url.pathname);
}

export function registrationServiceLinesForReturn(returnTo: string): ServiceLine[] {
  return isPropertyReturnTo(returnTo) ? ["real_estate"] : [];
}
