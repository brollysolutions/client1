export const CATALOGUE_NAVIGATION_FALLBACK_MS = 8_000;

const CATALOGUE_SCROLL_RECOVERY_KEY = "dhanadhara:catalogue-navigation-scroll";
const CATALOGUE_SCROLL_RECOVERY_MAX_AGE_MS = 60_000;

type ScrollRecovery = {
  createdAt: number;
  scrollY: number;
};

export type CatalogueNavigationFallbackDependencies = {
  currentHref: () => string;
  currentScrollY: () => number;
  persistScroll: (scrollY: number) => void;
  replaceLocation: (href: string) => void;
  schedule: (callback: () => void, delayMs: number) => number;
};

/**
 * Keep same-page App Router navigation as the fast path, but recover if its
 * RSC stream never commits. The callback re-checks the URL so a navigation
 * that completed near the timeout does not trigger an unnecessary reload.
 */
export function scheduleCatalogueNavigationFallback(
  href: string,
  dependencies: CatalogueNavigationFallbackDependencies,
  delayMs = CATALOGUE_NAVIGATION_FALLBACK_MS,
): number {
  return dependencies.schedule(() => {
    if (dependencies.currentHref() === href) return;
    dependencies.persistScroll(dependencies.currentScrollY());
    dependencies.replaceLocation(href);
  }, delayMs);
}

export function persistCatalogueScroll(
  storage: Pick<Storage, "setItem">,
  scrollY: number,
  now = Date.now(),
): void {
  try {
    storage.setItem(
      CATALOGUE_SCROLL_RECOVERY_KEY,
      JSON.stringify({ createdAt: now, scrollY } satisfies ScrollRecovery),
    );
  } catch {
    // Storage can be disabled by browser privacy settings. Navigation must
    // still recover even when scroll restoration cannot be persisted.
  }
}

export function consumeCatalogueScroll(
  storage: Pick<Storage, "getItem" | "removeItem">,
  now = Date.now(),
): number | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(CATALOGUE_SCROLL_RECOVERY_KEY);
    storage.removeItem(CATALOGUE_SCROLL_RECOVERY_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const recovery = JSON.parse(raw) as Partial<ScrollRecovery>;
    const age = typeof recovery.createdAt === "number" ? now - recovery.createdAt : -1;
    return age >= 0 &&
      age <= CATALOGUE_SCROLL_RECOVERY_MAX_AGE_MS &&
      typeof recovery.scrollY === "number" &&
      Number.isFinite(recovery.scrollY) &&
      recovery.scrollY >= 0
      ? recovery.scrollY
      : null;
  } catch {
    return null;
  }
}
