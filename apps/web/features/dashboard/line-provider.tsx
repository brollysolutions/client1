"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/components/auth/session-provider";
import { registerBusinessLineGetter } from "@/lib/api/client";
import type { BusinessLine } from "@/lib/auth";

import { useMe } from "./me-provider";
import { getDashboardPathLine } from "./nav-items";

const ACTIVE_LINE_KEY = "dashboard:active-line";

type LineState = {
  activeLine: BusinessLine;
  setActiveLine: (line: BusinessLine) => void;
  // Lines this client actually holds (drives whether the switcher shows).
  lines: BusinessLine[];
  canSwitch: boolean;
};

const LineContext = React.createContext<LineState | null>(null);

export function LineProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me } = useMe();
  const { session } = useAuth();
  // Restore the last-viewed line synchronously so a real-estate client never
  // sees a green loans frame flash before an effect flips it to amber. Safe to
  // touch localStorage in the initializer: this subtree only renders after the
  // client-side AppGuard passes, never during SSR (window guard is belt and
  // suspenders).
  const [activeLine, setActiveLineState] = React.useState<BusinessLine>(() => {
    if (typeof window === "undefined") return "loans";
    const saved = localStorage.getItem(ACTIVE_LINE_KEY);
    return saved === "loans" || saved === "real_estate" ? saved : "loans";
  });

  const lines = React.useMemo<BusinessLine[]>(() => {
    if (session?.role === "client") return me?.profiles.map((p) => p.businessLine) ?? [];
    if (
      (session?.role === "telecaller" || session?.role === "employee") &&
      session.businessLine === "both"
    ) {
      return ["loans", "real_estate"];
    }
    if (session?.businessLine === "loans" || session?.businessLine === "real_estate") {
      return [session.businessLine];
    }
    return [];
  }, [me, session?.businessLine, session?.role]);

  // If the restored/default line isn't one the client holds, fall back to a held
  // line so the view never points at a line the user can't access.
  React.useEffect(() => {
    if (lines.length > 0 && !lines.includes(activeLine)) {
      setActiveLineState(lines[0]);
    }
  }, [lines, activeLine]);

  const routeLine = getDashboardPathLine(pathname);
  const selectedLine = routeLine && lines.includes(routeLine) ? routeLine : activeLine;

  const setActiveLine = React.useCallback((line: BusinessLine) => {
    setActiveLineState(line);
    localStorage.setItem(ACTIVE_LINE_KEY, line);
  }, []);

  const lineRef = React.useRef(selectedLine);
  lineRef.current = selectedLine;
  const sendsSelectedLine =
    (session?.role === "telecaller" || session?.role === "employee") &&
    session.businessLine === "both";
  const sendsSelectedLineRef = React.useRef(sendsSelectedLine);
  sendsSelectedLineRef.current = sendsSelectedLine;
  const getterRegistered = React.useRef(false);
  if (!getterRegistered.current) {
    getterRegistered.current = true;
    registerBusinessLineGetter(() =>
      sendsSelectedLineRef.current ? lineRef.current : null,
    );
  }

  // Clients switch among held profiles. A dual-line Telecaller or Employee
  // switches the concrete line used for each request; the API validates it
  // before installing the PostgreSQL RLS context.
  const canSwitch =
    (session?.role === "client" && lines.length > 1) || sendsSelectedLine;

  const value = React.useMemo<LineState>(
    () => ({ activeLine: selectedLine, setActiveLine, lines, canSwitch }),
    [selectedLine, setActiveLine, lines, canSwitch],
  );

  return <LineContext.Provider value={value}>{children}</LineContext.Provider>;
}

export function useLine(): LineState {
  const ctx = React.useContext(LineContext);
  if (!ctx) throw new Error("useLine must be used within a LineProvider.");
  return ctx;
}
