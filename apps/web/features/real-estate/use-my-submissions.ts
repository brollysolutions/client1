"use client";

import * as React from "react";

import { listSubmissions, type Submission } from "@/lib/property-submissions-api";

// Fetches the signed-in author's own submissions across all statuses. The
// explicit `mine` query keeps platform Admin's management view distinct from
// the shared approval queue; RLS independently confines every non-Admin role.
export function useMySubmissions() {
  const [items, setItems] = React.useState<Submission[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listSubmissions(undefined, true);
    if (res.ok) setItems(res.data);
    else setError(res.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, error, reload: load };
}
