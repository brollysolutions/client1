"use client";

import * as React from "react";

import { listContentBlocks, type ContentBlock } from "@/lib/content-api";

// Fetches every content block (shared queue: sub_admin and admin both see all
// statuses). Exposes the async triad plus a refetch used after
// create/edit/publish/archive so the list stays in sync.
export function useContentQueue() {
  const [items, setItems] = React.useState<ContentBlock[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listContentBlocks();
    if (res.ok) setItems(res.data);
    else setError(res.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, error, reload: load };
}
