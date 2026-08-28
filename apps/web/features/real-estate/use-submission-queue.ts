"use client";

import * as React from "react";

import {
  listSubmissions,
  type Submission,
  type SubmissionStatus,
} from "@/lib/property-submissions-api";

/**
 * One review queue, scoped to a submission status.
 *
 * The endpoint has always accepted `?status=`; this hook used to hard-code
 * `"pending"`, which is what left the approvals page unable to show anything
 * but the awaiting-review half of the lifecycle.
 */
export function useSubmissionQueue(status: SubmissionStatus = "pending") {
  const [items, setItems] = React.useState<Submission[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listSubmissions(status);
    if (res.ok) setItems(res.data);
    else setError(res.error);
    setLoading(false);
  }, [status]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, error, reload: load };
}
