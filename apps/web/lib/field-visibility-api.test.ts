import { afterEach, describe, expect, it, vi } from "vitest";

import { listFieldVisibility, updateFieldVisibility } from "@/lib/field-visibility-api";

function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("field visibility API", () => {
  it("unwraps the server-owned catalogue", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        fakeResponse(200, {
          entries: [
            {
              id: null,
              target_role: "employee",
              entity: "lead",
              field_key: "mobile",
              label: "Lead mobile",
              mode: "allow",
              default_mode: "allow",
              allowed_modes: ["allow", "deny", "share_link"],
              locked: false,
              lock_reason: null,
              updated_at: null,
            },
          ],
        }),
      ),
    );

    const response = await listFieldVisibility();
    expect(response.ok && response.data[0].field_key).toBe("mobile");
  });

  it("sends one closed-catalogue update with PUT", async () => {
    const fetchMock = vi.fn(async (_url: string, _options?: RequestInit) =>
      fakeResponse(200, {}),
    );
    vi.stubGlobal("fetch", fetchMock);

    await updateFieldVisibility({
      target_role: "employee",
      entity: "lead",
      field_key: "mobile",
      mode: "share_link",
    });

    const [, options] = fetchMock.mock.calls[0];
    expect(options?.method).toBe("PUT");
    expect(JSON.parse(String(options?.body))).toEqual({
      target_role: "employee",
      entity: "lead",
      field_key: "mobile",
      mode: "share_link",
    });
  });
});
