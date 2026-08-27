import * as React from "react";

import { listSupportTicketsAdmin, type SupportTicketAdmin } from "@/lib/admin-api";

// Mirrors features/admin/use-agent-queue.ts: plain useState + useCallback
// loader, no caching or optimistic updates. `reload` is re-exposed so the
// view calls it after a successful advance instead of mutating local state.
//
// `status` is passed through to the API. The client wrapper and the route have
// always accepted it; this hook simply never sent it, so the console fetched
// every ticket ever raised and filtered them in the browser.
export function useSupportTicketsAdmin(status?: string) {
  const [items, setItems] = React.useState<SupportTicketAdmin[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listSupportTicketsAdmin(status);
    if (res.ok) setItems(res.data);
    else setError(res.error);
    setLoading(false);
  }, [status]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, error, reload: load };
}
