import { afterEach, describe, expect, it, vi } from "vitest";

import type { components } from "@contracts/generated/schema";

import {
  getPublicContentBlockBySlug,
  getPublicContentBlocks,
  mapPublicContentBlock,
} from "@/lib/public-content-blocks";

type Schemas = components["schemas"];

function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function wireBlock(
  overrides: Partial<Schemas["PublicContentBlockRead"]> = {},
): Schemas["PublicContentBlockRead"] {
  return {
    slug: "homepage-closing",
    section: "homepage-closing",
    title: "Built on trust",
    body: "We connect you with the right banks and real estate partners.",
    business_line: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mapPublicContentBlock()", () => {
  it("maps every wire field to the display shape", () => {
    const block = mapPublicContentBlock(wireBlock());
    expect(block).toEqual({
      slug: "homepage-closing",
      section: "homepage-closing",
      title: "Built on trust",
      body: "We connect you with the right banks and real estate partners.",
      businessLine: null,
    });
  });

  it("carries a null body through", () => {
    const block = mapPublicContentBlock(wireBlock({ body: null }));
    expect(block.body).toBeNull();
  });

  it("carries a non-null business_line through", () => {
    const block = mapPublicContentBlock(wireBlock({ business_line: "loans" }));
    expect(block.businessLine).toBe("loans");
  });
});

describe("getPublicContentBlocks()", () => {
  it("maps a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeResponse(200, { content_blocks: [wireBlock()] })),
    );

    const blocks = await getPublicContentBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0].slug).toBe("homepage-closing");
  });

  it("returns an empty array on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeResponse(500, { detail: "boom" })),
    );

    expect(await getPublicContentBlocks()).toEqual([]);
  });

  it("returns an empty array when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    expect(await getPublicContentBlocks()).toEqual([]);
  });

  it("returns an empty array on malformed JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => {
              throw new SyntaxError("Unexpected token");
            },
          }) as unknown as Response,
      ),
    );

    expect(await getPublicContentBlocks()).toEqual([]);
  });
});

describe("getPublicContentBlockBySlug()", () => {
  it("maps a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeResponse(200, wireBlock())),
    );

    const block = await getPublicContentBlockBySlug("homepage-closing");
    expect(block?.slug).toBe("homepage-closing");
  });

  it("returns null on a 404 (no published block at that slug)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeResponse(404, { detail: "Content block not found." })),
    );

    expect(await getPublicContentBlockBySlug("missing-slug")).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    expect(await getPublicContentBlockBySlug("homepage-closing")).toBeNull();
  });
});
