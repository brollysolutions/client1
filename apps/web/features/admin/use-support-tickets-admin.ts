import * as React from "react";

import { listSupportTicketsAdmin, type SupportTicketAdmin } from "@/lib/admin-api";

// Mirrors features/admin/use-agent-queue.ts: plain useState + useCallback
// loader, no caching or optimistic updates. `reload` is re-exposed so the
// view calls it after a successful advance instead of mutating local state.
export function useSupportTicketsAdmin() {
  const [items, setItems] = React.useState<SupportTicketAdmin[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listSupportTicketsAdmin();
    if (res.ok) setItems(res.data);
    else setError(res.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, error, reload: load };
}
