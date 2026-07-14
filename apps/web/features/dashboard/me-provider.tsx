"use client";

import * as React from "react";

import { getMe, type Me } from "@/lib/auth";

// Fetches GET /auth/me once for the whole authenticated shell and shares it, so
// the sidebar footer (name + avatar) and every dashboard page read one request
// instead of each firing their own. This is the profile fetch that surfaced the
// "Can't reach the server" error on the old dashboard; the resilience lives here
// now (one silent retry on a network blip, then a manual retry via useMe().retry).

type Status = "loading" | "ready" | "error";

type MeState = {
  me: Me | null;
  status: Status;
  // Present only when status === "error".
  error: string | null;
  errorStatus: number | null;
  retry: () => void;
};

const MeContext = React.createContext<MeState | null>(null);

export function MeProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = React.useState<Me | null>(null);
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
    let retried = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      const res = await getMe();
      if (!active) return;
      if (res.ok) {
        setMe(res.data);
        setStatus("ready");
        return;
      }
      // One automatic retry on a transient network failure (status 0) before
      // surfacing the error, so a cold backend or a brief blip doesn't dead-end
      // the dashboard. A real error (401 handled upstream, 4xx/5xx) shows at once.
      if (res.status === 0 && !retried) {
        retried = true;
        timer = setTimeout(() => void run(), 1500);
        return;
      }
      setError(res.error);
      setErrorStatus(res.status);
      setStatus("error");
    };

    void run();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [reloadKey]);

  const value = React.useMemo<MeState>(
    () => ({ me, status, error, errorStatus, retry }),
    [me, status, error, errorStatus, retry],
  );

  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}

export function useMe(): MeState {
  const ctx = React.useContext(MeContext);
  if (!ctx) throw new Error("useMe must be used within a MeProvider.");
  return ctx;
}
