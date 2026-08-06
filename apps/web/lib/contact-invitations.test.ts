import { afterEach, describe, expect, it, vi } from "vitest";

import { getContactInvitation } from "@/lib/contact-invitations";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getContactInvitation", () => {
  it("encodes the bearer token as one URL path segment", async () => {
    const fetchMock = vi.fn(async (_url: string, _options?: RequestInit) =>
      ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ valid: false }),
      }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await getContactInvitation("not/a?real#token");
    expect(response.ok && response.data.valid).toBe(false);
    expect(String(fetchMock.mock.calls[0][0])).toContain("not%2Fa%3Freal%23token");
  });
});
