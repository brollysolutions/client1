import { afterEach, describe, expect, it, vi } from "vitest";

import { registerTokenGetter, registerTokenRefresher } from "@/lib/api/client";

import {
  submitAgentApplication,
  uploadFileToPresignedPost,
  type AgentApplicationInput,
} from "@/lib/agent-application";

function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function file(name: string, type: string): File {
  return new File(["x"], name, { type });
}

function baseInput(overrides: Partial<AgentApplicationInput> = {}): AgentApplicationInput {
  return {
    ticket: "ticket-abc",
    firstName: "Ravi",
    lastName: "Kumar",
    email: "ravi@example.com",
    businessLine: "loans",
    aadhaarFront: file("front.jpg", "image/jpeg"),
    aadhaarBack: file("back.jpg", "image/jpeg"),
    pan: file("pan.jpg", "image/jpeg"),
    photo: file("photo.jpg", "image/jpeg"),
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  registerTokenGetter(() => null);
  registerTokenRefresher(async () => null);
});

const STORAGE_URL = "https://storage.test/bucket";

function presignResponseFor(docType: string) {
  return fakeResponse(200, {
    object_key: `agent-applications/jti-1/uuid-${docType}`,
    upload_url: STORAGE_URL,
    fields: { key: `agent-applications/jti-1/uuid-${docType}`, policy: "abc", signature: "def" },
    max_bytes: 5 * 1024 * 1024,
  });
}

describe("submitAgentApplication orchestration", () => {
  it("presigns and uploads all 4 documents, then submits, in order", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
      calls.push(url);
      if (url.endsWith("/uploads/presign")) {
        const body = JSON.parse(opts?.body as string);
        return presignResponseFor(body.doc_type);
      }
      if (url === STORAGE_URL) {
        return fakeResponse(201, {});
      }
      if (url.endsWith("/api/v1/agent-applications")) {
        return fakeResponse(202, { ok: true });
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitAgentApplication(baseInput());

    expect(result).toEqual({ ok: true });
    // 4 presigns, then 4 storage uploads, then 1 submit — interleaved per
    // document (presign -> upload -> presign -> upload -> ...), submit last.
    const presignCalls = calls.filter((u) => u.endsWith("/uploads/presign"));
    const storageCalls = calls.filter((u) => u === STORAGE_URL);
    expect(presignCalls).toHaveLength(4);
    expect(storageCalls).toHaveLength(4);
    expect(calls[calls.length - 1]).toContain("/api/v1/agent-applications");
    expect(calls.indexOf(STORAGE_URL)).toBeLessThan(calls.length - 1);
  });

  it("appends the file part LAST in the storage FormData, with all policy fields", async () => {
    let capturedForm: FormData | undefined;
    const fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url.endsWith("/uploads/presign")) return presignResponseFor("photo");
      if (url === STORAGE_URL) {
        capturedForm = opts?.body as FormData;
        return fakeResponse(201, {});
      }
      return fakeResponse(202, { ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    await submitAgentApplication(baseInput());

    expect(capturedForm).toBeDefined();
    const keys = Array.from(capturedForm!.keys());
    expect(keys[keys.length - 1]).toBe("file");
    expect(capturedForm!.get("key")).toBe("agent-applications/jti-1/uuid-photo");
    expect(capturedForm!.get("policy")).toBe("abc");
    expect(capturedForm!.get("signature")).toBe("def");
  });

  it("short-circuits on a failed presign and never calls submit", async () => {
    let submitCalled = false;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/uploads/presign")) {
        return fakeResponse(400, { detail: "Your verification expired." });
      }
      if (url.endsWith("/api/v1/agent-applications")) {
        submitCalled = true;
        return fakeResponse(202, { ok: true });
      }
      return fakeResponse(201, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitAgentApplication(baseInput());

    expect(result).toEqual({ ok: false, error: "Your verification expired." });
    expect(submitCalled).toBe(false);
  });

  it("short-circuits on a failed storage upload and never calls submit", async () => {
    let submitCalled = false;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/uploads/presign")) return presignResponseFor("aadhaar_front");
      if (url === STORAGE_URL) return fakeResponse(500, {});
      if (url.endsWith("/api/v1/agent-applications")) {
        submitCalled = true;
        return fakeResponse(202, { ok: true });
      }
      return fakeResponse(201, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitAgentApplication(baseInput());

    expect(result.ok).toBe(false);
    expect(submitCalled).toBe(false);
  });

  it("submit body carries application_ticket and never a mobile field", async () => {
    let submitBody: Record<string, unknown> | undefined;
    const fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url.endsWith("/uploads/presign")) {
        const body = JSON.parse(opts?.body as string);
        return presignResponseFor(body.doc_type);
      }
      if (url === STORAGE_URL) return fakeResponse(201, {});
      submitBody = JSON.parse(opts?.body as string);
      return fakeResponse(202, { ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    await submitAgentApplication(baseInput({ ticket: "ticket-xyz" }));

    expect(submitBody).toBeDefined();
    expect(submitBody!.application_ticket).toBe("ticket-xyz");
    expect(submitBody).not.toHaveProperty("mobile");
  });

  it("rejects an unsupported file type before any network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitAgentApplication(
      baseInput({ photo: file("photo.gif", "image/gif") }),
    );

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("uploadFileToPresignedPost", () => {
  it("returns ok:false on a network failure rather than throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const result = await uploadFileToPresignedPost(STORAGE_URL, { key: "x" }, file("a.jpg", "image/jpeg"));
    expect(result).toEqual({ ok: false });
  });
});
