"use client";

import * as React from "react";

import type { BusinessLine } from "@/lib/auth";

import { useMe } from "./me-provider";

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
  const { me } = useMe();
  const [activeLine, setActiveLineState] = React.useState<BusinessLine>("loans");

  // Restore the last-viewed line before content paints.
  React.useEffect(() => {
    const saved = localStorage.getItem(ACTIVE_LINE_KEY);
    if (saved === "loans" || saved === "real_estate") setActiveLineState(saved);
  }, []);

  const lines = React.useMemo<BusinessLine[]>(
    () => me?.profiles.map((p) => p.businessLine) ?? [],
    [me],
  );

  // If the restored/default line isn't one the client holds, fall back to a held
  // line so the view never points at a line the user can't access.
  React.useEffect(() => {
    if (lines.length > 0 && !lines.includes(activeLine)) {
      setActiveLineState(lines[0]);
    }
  }, [lines, activeLine]);

  const setActiveLine = React.useCallback((line: BusinessLine) => {
    setActiveLineState(line);
    localStorage.setItem(ACTIVE_LINE_KEY, line);
  }, []);

  const value = React.useMemo<LineState>(
    () => ({ activeLine, setActiveLine, lines, canSwitch: lines.length > 1 }),
    [activeLine, setActiveLine, lines],
  );

  return <LineContext.Provider value={value}>{children}</LineContext.Provider>;
}

export function useLine(): LineState {
  const ctx = React.useContext(LineContext);
  if (!ctx) throw new Error("useLine must be used within a LineProvider.");
  return ctx;
}
