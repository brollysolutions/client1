import { describe, expect, it } from "vitest";

import {
  listingLinkError,
  renderableListingLinks,
  resolveListingLinkPlatform,
} from "@/lib/listing-links";

describe("resolveListingLinkPlatform()", () => {
  it.each([
    ["https://www.youtube.com/watch?v=abc", "youtube"],
    ["https://youtube.com/watch?v=abc", "youtube"],
    ["https://m.youtube.com/watch?v=abc", "youtube"],
    ["https://youtu.be/abc", "youtube"],
    ["https://www.instagram.com/reel/abc/", "instagram"],
    ["https://www.facebook.com/listing/posts/one", "facebook"],
    ["https://fb.watch/abc/", "facebook"],
  ])("resolves %s to %s", (url, platform) => {
    expect(resolveListingLinkPlatform(url)).toBe(platform);
  });

  it("ignores a trailing root dot on an allowlisted host", () => {
    expect(resolveListingLinkPlatform("https://www.youtube.com./watch?v=abc")).toBe("youtube");
  });

  it("matches the host exactly rather than by suffix", () => {
    // The mirror of the server rule: a suffix test would trust this.
    expect(resolveListingLinkPlatform("https://youtube.com.evil.example/watch")).toBeNull();
    expect(resolveListingLinkPlatform("https://notyoutube.com/watch")).toBeNull();
  });

  it.each([
    "http://www.youtube.com/watch?v=abc",
    "https://user:pass@www.youtube.com/watch?v=abc",
    "https://bit.ly/abc",
    "javascript:alert(1)",
    "//www.youtube.com/watch?v=abc",
    "not a url",
    "",
  ])("rejects %s", (url) => {
    expect(resolveListingLinkPlatform(url)).toBeNull();
  });
});

describe("listingLinkError()", () => {
  it("passes an empty row so an unused slot is not an error", () => {
    expect(listingLinkError("")).toBeUndefined();
    expect(listingLinkError("   ")).toBeUndefined();
  });

  it("explains which hosts are accepted", () => {
    expect(listingLinkError("https://example.com/listing")).toMatch(
      /YouTube, Instagram, or Facebook/,
    );
  });

  it("accepts an allowlisted link", () => {
    expect(listingLinkError("https://youtu.be/abc")).toBeUndefined();
  });
});

describe("renderableListingLinks()", () => {
  it("returns nothing for null or empty input", () => {
    expect(renderableListingLinks(null)).toEqual([]);
    expect(renderableListingLinks(undefined)).toEqual([]);
    expect(renderableListingLinks([])).toEqual([]);
  });

  it("re-derives the platform instead of trusting the stored one", () => {
    const links = [{ url: "https://www.instagram.com/reel/abc/", platform: "youtube" as const }];

    expect(renderableListingLinks(links)).toEqual([
      { url: "https://www.instagram.com/reel/abc/", platform: "instagram" },
    ]);
  });

  it("drops a stored link whose host is no longer allowlisted", () => {
    const links = [
      { url: "https://youtu.be/abc", platform: "youtube" as const },
      { url: "https://removed.example/listing", platform: "youtube" as const },
    ];

    expect(renderableListingLinks(links)).toEqual([
      { url: "https://youtu.be/abc", platform: "youtube" },
    ]);
  });

  it("caps the rendered list even if more were somehow stored", () => {
    const links = Array.from({ length: 7 }, (_, index) => ({
      url: `https://youtu.be/abc${index}`,
      platform: "youtube" as const,
    }));

    expect(renderableListingLinks(links)).toHaveLength(4);
  });
});
