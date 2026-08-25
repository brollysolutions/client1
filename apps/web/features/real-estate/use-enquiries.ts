"use client";

import * as React from "react";

import { getEnquiries, type Enquiry } from "@/lib/enquiries";

type Status = "loading" | "ready" | "error";

// Fetches the client's own enquiries once on mount (RLS-scoped server-side).
// Extracted from enquiries-view.tsx so the Home summary and the full
// Enquiries page share one fetch implementation instead of two copies of the
// same loading/error/retry boilerplate (mirrors use-properties.ts's shape).
export function useEnquiries() {
  const [enquiries, setEnquiries] = React.useState<Enquiry[]>([]);
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
      const res = await getEnquiries();
      if (!active) return;
      if (res.ok) {
        setEnquiries(res.data);
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

  return { enquiries, status, error, errorStatus, retry };
}
