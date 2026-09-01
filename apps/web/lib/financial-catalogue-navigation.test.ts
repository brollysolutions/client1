import { describe, expect, it, vi } from "vitest";

import {
  CATALOGUE_NAVIGATION_FALLBACK_MS,
  consumeCatalogueScroll,
  persistCatalogueScroll,
  scheduleCatalogueNavigationFallback,
} from "./financial-catalogue-navigation";

describe("catalogue filter navigation", () => {
  it("falls back only when the App Router has not committed by the deadline", () => {
    let callback: (() => void) | undefined;
    let currentHref = "/loans";
    const persistScroll = vi.fn();
    const replaceLocation = vi.fn();
    const schedule = vi.fn((scheduled: () => void) => {
      callback = scheduled;
      return 17;
    });

    const timer = scheduleCatalogueNavigationFallback("/loans?q=insurance", {
      currentHref: () => currentHref,
      currentScrollY: () => 640,
      persistScroll,
      replaceLocation,
      schedule,
    });

    expect(timer).toBe(17);
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), CATALOGUE_NAVIGATION_FALLBACK_MS);
    callback?.();
    expect(persistScroll).toHaveBeenCalledWith(640);
    expect(replaceLocation).toHaveBeenCalledWith("/loans?q=insurance");

    persistScroll.mockClear();
    replaceLocation.mockClear();
    currentHref = "/loans?q=insurance";
    callback?.();
    expect(persistScroll).not.toHaveBeenCalled();
    expect(replaceLocation).not.toHaveBeenCalled();
  });

  it("restores only a fresh, one-time scroll coordinate", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      removeItem: vi.fn((key: string) => values.delete(key)),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    };

    persistCatalogueScroll(storage, 640, 1_000);
    expect(consumeCatalogueScroll(storage, 2_000)).toBe(640);
    expect(consumeCatalogueScroll(storage, 2_000)).toBeNull();

    persistCatalogueScroll(storage, 640, 1_000);
    expect(consumeCatalogueScroll(storage, 62_000)).toBeNull();
  });
});
