"use client";

import * as React from "react";

import { getAgentLead, updateAgentLead, type AgentLead, type AgentLeadUpdate } from "@/lib/agent-api";
import type { ApiResponse } from "@/lib/api/client";

type Status = "loading" | "ready" | "error";

export function useAgentLeadDetail(leadId: string) {
  const [lead, setLead] = React.useState<AgentLead | null>(null);
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
      const res = await getAgentLead(leadId);
      if (!active) return;
      if (res.ok) {
        setLead(res.data);
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
  }, [leadId, reloadKey]);

  async function update(payload: AgentLeadUpdate): Promise<ApiResponse<unknown>> {
    const res = await updateAgentLead(leadId, payload);
    if (res.ok) retry();
    return res;
  }

  return { lead, status, error, errorStatus, retry, update };
}
