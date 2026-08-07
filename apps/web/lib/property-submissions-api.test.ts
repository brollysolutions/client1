import { afterEach, describe, expect, it, vi } from "vitest";

import { registerTokenGetter, registerTokenRefresher } from "@/lib/api/client";
import { uploadPropertyMedia } from "@/lib/property-submissions-api";

function response(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  registerTokenGetter(() => null);
  registerTokenRefresher(async () => null);
});

describe("uploadPropertyMedia", () => {
  it("presigns and uploads images before private reviewer documents", async () => {
    const calls: string[] = [];
    const presignBodies: Array<Record<string, unknown>> = [];
    let serial = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(url);
        if (url.endsWith("/media-upload-url")) {
          presignBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
          serial += 1;
          return response(200, {
            object_key: `private/property-submissions/staging/owner/batch-${serial}/asset`,
            upload_url: "https://storage.test/bucket",
            fields: { key: `asset-${serial}`, policy: "signed" },
            max_bytes: 5 * 1024 * 1024,
          });
        }
        return response(201);
      }),
    );

    const result = await uploadPropertyMedia(
      [new File(["image"], "front.jpg", { type: "image/jpeg" })],
      [new File(["pdf"], "rera.pdf", { type: "application/pdf" })],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.media.map((asset) => [asset.kind, asset.position])).toEqual([
      ["image", 0],
      ["document", 1],
    ]);
    expect(calls.filter((url) => url.endsWith("/media-upload-url"))).toHaveLength(2);
    expect(calls.filter((url) => url === "https://storage.test/bucket")).toHaveLength(2);
    expect(presignBodies).toEqual([
      { kind: "image", content_type: "image/jpeg" },
      { kind: "document", content_type: "application/pdf" },
    ]);
    expect(presignBodies.every((body) => !("filename" in body))).toBe(true);
  });

  it("stops before submission metadata when storage rejects an upload", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          response(200, {
            object_key: "private/property-submissions/staging/owner/batch/asset",
            upload_url: "https://storage.test/bucket",
            fields: { key: "asset", policy: "signed" },
            max_bytes: 5 * 1024 * 1024,
          }),
        )
        .mockResolvedValueOnce(response(500)),
    );

    const result = await uploadPropertyMedia(
      [new File(["image"], "front.jpg", { type: "image/jpeg" })],
      [],
    );
    expect(result).toEqual({ ok: false, error: "Could not upload front.jpg." });
  });
});
