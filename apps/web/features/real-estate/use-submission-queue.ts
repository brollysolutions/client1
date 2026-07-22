"use client";

import * as React from "react";

import { listSubmissions, type Submission } from "@/lib/property-submissions-api";

// Fetches the pending review queue. Exposes the async triad + a refetch used
// after an approve/reject so the actioned row leaves the list.
export function useSubmissionQueue() {
  const [items, setItems] = React.useState<Submission[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listSubmissions("pending");
    if (res.ok) setItems(res.data);
    else setError(res.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, error, reload: load };
}
