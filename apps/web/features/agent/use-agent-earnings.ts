"use client";

import * as React from "react";

import { getAgentEarnings, type AgentEarnings } from "@/lib/agent-api";

// Mirrors use-agent-home.ts's status/retry shape.
export function useAgentEarnings() {
  const [earnings, setEarnings] = React.useState<AgentEarnings | null>(null);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");
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
      const res = await getAgentEarnings();
      if (!active) return;
      if (!res.ok) {
        setError(res.error);
        setErrorStatus(res.status);
        setStatus("error");
        return;
      }
      setEarnings(res.data);
      setStatus("ready");
    };
    void run();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  return { earnings, status, error, errorStatus, retry };
}
