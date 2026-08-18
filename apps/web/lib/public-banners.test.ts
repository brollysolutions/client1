import { afterEach, describe, expect, it, vi } from "vitest";

import type { components } from "@contracts/generated/schema";

import { getHeroBanners, mapPublicBanner } from "@/lib/public-banners";

type Schemas = components["schemas"];

function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function wireBanner(overrides: Partial<Schemas["PublicBannerRead"]> = {}): Schemas["PublicBannerRead"] {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Diwali Loan Offer",
    subtitle: "Limited period rates",
    cta_label: "Apply now",
    deep_link: "/loans",
    image_url: null,
    offer_badge: null,
    rera_verified: false,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mapPublicBanner()", () => {
  it("maps every wire field to the display shape", () => {
    const banner = mapPublicBanner(wireBanner());
    expect(banner).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      title: "Diwali Loan Offer",
      subtitle: "Limited period rates",
      image: undefined,
      offerBadge: undefined,
      reraVerified: undefined,
      cta: { label: "Apply now", href: "/loans" },
    });
  });

  it("converts a null subtitle to undefined", () => {
    const banner = mapPublicBanner(wireBanner({ subtitle: null }));
    expect(banner.subtitle).toBeUndefined();
  });

  it("leaves image undefined when image_url is null", () => {
    const banner = mapPublicBanner(wireBanner());
    expect(banner.image).toBeUndefined();
  });

  it("keeps image_url when its host is the dev minio allowlist entry", () => {
    const banner = mapPublicBanner(
      wireBanner({ image_url: "http://localhost:9000/task-documents/public/banners/x/y.jpg" }),
    );
    expect(banner.image).toBe("http://localhost:9000/task-documents/public/banners/x/y.jpg");
  });

  it("keeps reviewed bundled template artwork", () => {
    const banner = mapPublicBanner(
      wireBanner({ image_url: "/banner-templates/homepage/loans.webp" }),
    );
    expect(banner.image).toBe("/banner-templates/homepage/loans.webp");
  });

  it("drops traversal and protocol-relative template paths", () => {
    expect(
      mapPublicBanner(
        wireBanner({ image_url: "/banner-templates/../private/file.webp" }),
      ).image,
    ).toBeUndefined();
    expect(
      mapPublicBanner(
        wireBanner({ image_url: "//banner-templates.example/file.webp" }),
      ).image,
    ).toBeUndefined();
  });

  it("maps an offer badge", () => {
    expect(mapPublicBanner(wireBanner({ offer_badge: "10% off · Code SAVE10" })).offerBadge).toBe(
      "10% off · Code SAVE10",
    );
  });

  it("maps the server-derived RERA verification state", () => {
    expect(mapPublicBanner(wireBanner({ rera_verified: true })).reraVerified).toBe(true);
  });

  it("drops image_url from a host outside the allowlist", () => {
    const banner = mapPublicBanner(
      wireBanner({ image_url: "https://evil.example.com/public/banners/x/y.jpg" }),
    );
    expect(banner.image).toBeUndefined();
  });

  it("drops a malformed image_url", () => {
    const banner = mapPublicBanner(wireBanner({ image_url: "not-a-url" }));
    expect(banner.image).toBeUndefined();
  });

  it("omits the cta when cta_label is null", () => {
    const banner = mapPublicBanner(wireBanner({ cta_label: null }));
    expect(banner.cta).toBeUndefined();
  });

  it("omits the cta when deep_link is null", () => {
    const banner = mapPublicBanner(wireBanner({ deep_link: null }));
    expect(banner.cta).toBeUndefined();
  });

  it("omits the cta when deep_link is an absolute off-site URL (same-origin guard)", () => {
    const banner = mapPublicBanner(wireBanner({ deep_link: "https://evil.example.com" }));
    expect(banner.cta).toBeUndefined();
  });

  it("omits the cta when deep_link is protocol-relative (// resolves off-site)", () => {
    const banner = mapPublicBanner(wireBanner({ deep_link: "//evil.example.com" }));
    expect(banner.cta).toBeUndefined();
  });

  it("omits the cta when deep_link is a backslash-led path (normalizes like //)", () => {
    const banner = mapPublicBanner(wireBanner({ deep_link: "/\\evil.example.com" }));
    expect(banner.cta).toBeUndefined();
  });

  it("keeps the cta when deep_link is a repo-local path", () => {
    const banner = mapPublicBanner(wireBanner({ deep_link: "/real-estate" }));
    expect(banner.cta).toEqual({ label: "Apply now", href: "/real-estate" });
  });
});

describe("getHeroBanners()", () => {
  it("maps a successful response", async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, { banners: [wireBanner()] }));
    vi.stubGlobal("fetch", fetchMock);

    const banners = await getHeroBanners("properties");
    expect(banners).toHaveLength(1);
    expect(banners[0].id).toBe("11111111-1111-1111-1111-111111111111");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/public/banners?placement=properties"),
      expect.anything(),
    );
  });

  it("returns an empty array on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeResponse(500, { detail: "boom" })),
    );

    expect(await getHeroBanners()).toEqual([]);
  });

  it("returns an empty array when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    expect(await getHeroBanners()).toEqual([]);
  });

  it("returns an empty array on malformed JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    }) as unknown as Response));

    expect(await getHeroBanners()).toEqual([]);
  });
});
