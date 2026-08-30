import { afterEach, describe, expect, it, vi } from "vitest";

import { registerTokenGetter, registerTokenRefresher } from "@/lib/api/client";
import {
  correctApprovedSubmission,
  getSubmission,
  uploadPropertyMedia,
} from "@/lib/property-submissions-api";

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
      null,
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
      null,
    );
    expect(result).toEqual({ ok: false, error: "Could not upload front.jpg." });
  });

  it("uploads an optional panorama after images and reviewer documents", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/media-upload-url")) {
          bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
          return response(200, {
            object_key: "private/property-submissions/staging/owner/batch/asset.webp",
            upload_url: "https://storage.test/bucket",
            fields: { key: "asset", policy: "signed" },
            max_bytes: 5 * 1024 * 1024,
          });
        }
        return response(201);
      }),
    );

    const result = await uploadPropertyMedia(
      [new File(["image"], "front.jpg", { type: "image/jpeg" })],
      [],
      new File(["panorama"], "tour.webp", { type: "image/webp" }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.media.map((asset) => asset.kind)).toEqual(["image", "panorama"]);
    expect(bodies.at(-1)).toEqual({ kind: "panorama", content_type: "image/webp" });
  });
});

describe("getSubmission", () => {
  it("loads one submission detail for processing-status polling", async () => {
    const submission = { id: "11111111-1111-4111-8111-111111111111", media: [] };
    const fetchMock = vi.fn().mockResolvedValue(response(200, submission));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getSubmission(submission.id);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/api/v1/property-submissions/${submission.id}`),
      expect.any(Object),
    );
  });
});

describe("correctApprovedSubmission", () => {
  it("uses the dedicated reasoned correction command", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, { id: "submission-id" }));
    vi.stubGlobal("fetch", fetchMock);
    const payload = {
      title: "Corrected listing",
      reason: "Verified against source paperwork.",
    } as Parameters<typeof correctApprovedSubmission>[1];

    const result = await correctApprovedSubmission("submission-id", payload);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/property-submissions/submission-id/correction"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    );
  });
});
