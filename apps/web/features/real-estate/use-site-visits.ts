"use client";

import * as React from "react";

import { getSiteVisits, type SiteVisit } from "@/lib/site-visits";

type Status = "loading" | "ready" | "error";

// Fetches the client's own site visits once on mount (RLS-scoped server-side).
// Extracted from site-visits-view.tsx so the Home summary and the full Site
// Visits page share one fetch implementation. Exposes `setSiteVisits` so a
// consumer that mutates a visit in place (site-visits-view.tsx's cancel
// action) can apply the API's returned row without a full refetch.
export function useSiteVisits() {
  const [siteVisits, setSiteVisits] = React.useState<SiteVisit[]>([]);
  const [status, setStatus] = React.useState<Status>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const retry = React.useCallback(() => {
    setStatus("loading");
    setError(null);
    setErrorStatus(null);
    setReloadKey((k) => k + 1);
  }, []);

  React.useEffect(() => {
    let active = true;
    const run = async () => {
      const res = await getSiteVisits();
      if (!active) return;
      if (res.ok) {
        setSiteVisits(res.data);
        setStatus("ready");
        return;
      }
      setError(res.error);
      setErrorStatus(res.status);
      setStatus("error");
    };
    void run();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  return { siteVisits, setSiteVisits, status, error, errorStatus, retry };
}

// Pure helper (no React, so it's testable without rendering the hook):
// the soonest visit that's still on the calendar, or undefined if there is
// none. Used by the Home summary card's "Next: <date>" hint.
export function nextUpcomingVisit(siteVisits: SiteVisit[]): SiteVisit | undefined {
  return siteVisits
    .filter((visit) => visit.status === "requested" || visit.status === "confirmed")
    .sort((a, b) => a.preferredDate.localeCompare(b.preferredDate))[0];
}
