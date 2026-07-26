"use client";

import * as React from "react";

import { getAgentApplication, type AgentApplicationDetail } from "@/lib/admin-api";

// Fetches the full application (incl. KYC document download links) on
// demand, not as part of the list. presign_download URLs are 5-minute
// signed links (services/storage.py), so they must be minted fresh when
// the dialog opens, not baked into the list response an admin might sit on
// for a while before clicking a row.
export function useAgentApplicationDetail(id: string | null) {
  const [detail, setDetail] = React.useState<AgentApplicationDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const res = await getAgentApplication(id);
    if (res.ok) setDetail(res.data);
    else setError(res.error);
    setLoading(false);
  }, [id]);

  React.useEffect(() => {
    if (!id) {
      setDetail(null);
      setError(null);
      return;
    }
    void load();
  }, [id, load]);

  return { detail, loading, error, reload: load };
}
