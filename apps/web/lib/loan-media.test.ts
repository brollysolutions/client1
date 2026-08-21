import { describe, expect, it } from "vitest";

import type { LoanDocument } from "@/lib/loan-documents";
import type { LoanApplication } from "@/lib/loans";

import { groupLoanMedia, validateLoanMediaFile } from "./loan-media";

function application(id: string, openedOn: string): LoanApplication {
  return {
    id,
    loanTypeLabel: `Loan ${id}`,
    status: "new",
    statusReason: null,
    amountRequested: null,
    amountSanctioned: null,
    interestRate: null,
    processingFee: null,
    feeOutcome: null,
    openedOn,
  closedOn: null,
  formVersion: null,
  formSchema: null,
  formAnswers: null,
  };
}

function document(id: string, applicationId: string): LoanDocument {
  return {
    id,
    loan_application_uuid: applicationId,
    doc_type: "photo",
    verified: false,
    review_note: null,
    uploaded_at: "2026-08-09T10:00:00Z",
    content_type: "image/jpeg",
    size_bytes: 1024,
    preview_url: "https://storage.test/preview",
    playback_url: null,
    download_url: "https://storage.test/download",
    processing_status: "ready",
    processing_error_code: null,
    duration_seconds: null,
  };
}

describe("groupLoanMedia", () => {
  it("groups media by application and orders the newest application first", () => {
    const older = application("older", "2026-07-01T00:00:00Z");
    const newer = application("newer", "2026-08-01T00:00:00Z");

    const groups = groupLoanMedia(
      [older, newer],
      [document("old-1", older.id), document("new-1", newer.id), document("old-2", older.id)],
    );

    expect(groups.map((group) => group.applicationId)).toEqual(["newer", "older"]);
    expect(groups[1].documents.map((item) => item.id)).toEqual(["old-1", "old-2"]);
  });

  it("keeps a document visible when application metadata is unexpectedly missing", () => {
    const [group] = groupLoanMedia([], [document("media-1", "missing")]);
    expect(group.application).toBeNull();
    expect(group.documents[0].id).toBe("media-1");
  });
});

describe("validateLoanMediaFile", () => {
  it("accepts supported non-empty files within 5 MiB", () => {
    expect(validateLoanMediaFile({ type: "application/pdf", size: 5 * 1024 * 1024 })).toBeNull();
  });

  it("accepts MP4 video up to the separate 20 MiB cap", () => {
    expect(validateLoanMediaFile({ type: "video/mp4", size: 20 * 1024 * 1024 })).toBeNull();
    expect(validateLoanMediaFile({ type: "video/mp4", size: 20 * 1024 * 1024 + 1 })).toMatch(
      /20 MiB/,
    );
  });

  it("rejects unsupported, empty, and oversized files before presign", () => {
    expect(validateLoanMediaFile({ type: "text/html", size: 10 })).toMatch(/JPEG/);
    expect(validateLoanMediaFile({ type: "image/jpeg", size: 0 })).toMatch(/empty/);
    expect(validateLoanMediaFile({ type: "image/jpeg", size: 5 * 1024 * 1024 + 1 })).toMatch(
      /5 MiB/,
    );
  });
});
