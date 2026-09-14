"use client";

import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";

const SYSTEM_QUERY = "(prefers-color-scheme: dark)";
function subscribeSystem(onChange: () => void) {
  const media = window.matchMedia(SYSTEM_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
function systemSnapshot() {
  return window.matchMedia(SYSTEM_QUERY).matches ? "dark" : "light";
}
function serverSnapshot() { return undefined; }

function BrowserThemeColor() {
  const { resolvedTheme, forcedTheme } = useTheme();
  const appearance = forcedTheme ?? resolvedTheme;
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", appearance === "dark" ? "#0D1626" : "#F0F7FC");
  }, [appearance]);
  return null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const dashboard = pathname === "/dashboard" || pathname?.startsWith("/dashboard/");
  const system = useSyncExternalStore(subscribeSystem, systemSnapshot, serverSnapshot);
  // Separate scopes prevent a saved dashboard choice from changing public/auth
  // pages. Remount only when crossing scopes so next-themes restores the right
  // preference. The old site-wide preference intentionally does not carry over.
  const scope = dashboard ? "dashboard" : "system";
  return (
    <NextThemesProvider key={scope} attribute="class" defaultTheme="system" enableSystem
      storageKey={`dhanadhara:${scope}-theme`} forcedTheme={dashboard ? undefined : system}
      disableTransitionOnChange>
      <BrowserThemeColor />{children}
    </NextThemesProvider>
  );
}
