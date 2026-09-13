import { afterEach, describe, expect, it, vi } from "vitest";

import { getPublishedServiceProducts, getPublicFinancialProduct } from "@/lib/financial-catalog";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("published service metadata", () => {
  it("distinguishes an unpublished service from a temporary API outage", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("Not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 })));
    await expect(getPublicFinancialProduct("personal-loan")).resolves.toBeNull();
    await expect(getPublicFinancialProduct("personal-loan")).rejects.toThrow("temporarily unavailable");
  });
  it("reads subsequent anonymous catalogue pages without dropping configured services", async () => {
    const first = Array.from({ length: 100 }, (_, index) => ({ slug: `service-${index}` }));
    const last = [{ slug: "equipment-financing" }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: first, total: 101, page: 1, page_size: 100 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: last, total: 101, page: 2, page_size: 100 })));
    vi.stubGlobal("fetch", fetchMock);

    expect(await getPublishedServiceProducts()).toEqual([...first, ...last]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/public\/financial-products\?page=2&page_size=100$/);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "GET", next: { revalidate: 0 } });
  });

  it("keeps only successfully published rows when a later page is unavailable", async () => {
    const available = [{ slug: "personal-loan" }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: available, total: 250, page: 1, page_size: 100 })))
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await getPublishedServiceProducts()).toEqual(available);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not invent published products when the catalogue cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Fixture offline")));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await getPublishedServiceProducts()).toEqual([]);
  });
});
