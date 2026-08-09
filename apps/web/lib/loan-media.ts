import type { LoanDocument } from "@/lib/loan-documents";
import type { LoanApplication } from "@/lib/loans";

export const LOAN_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const LOAN_VIDEO_MAX_BYTES = 20 * 1024 * 1024;
export const LOAN_MEDIA_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf,video/mp4";
export const LOAN_CAMERA_ACCEPT = "image/jpeg,image/png,image/webp";

const SUPPORTED_CONTENT_TYPES = new Set(LOAN_MEDIA_ACCEPT.split(","));

export type LoanMediaGroup = {
  applicationId: string;
  application: LoanApplication | null;
  documents: LoanDocument[];
};

export function validateLoanMediaFile(file: { type: string; size: number }): string | null {
  if (!SUPPORTED_CONTENT_TYPES.has(file.type)) {
    return "Choose a JPEG, PNG, WebP, PDF, or MP4 file.";
  }
  if (file.size < 1) return "The selected file is empty.";
  const maxBytes = file.type === "video/mp4" ? LOAN_VIDEO_MAX_BYTES : LOAN_MEDIA_MAX_BYTES;
  if (file.size > maxBytes) {
    return `The selected file must be ${file.type === "video/mp4" ? "20" : "5"} MiB or smaller.`;
  }
  return null;
}

export function groupLoanMedia(
  applications: LoanApplication[],
  documents: LoanDocument[],
): LoanMediaGroup[] {
  const applicationsById = new Map(applications.map((application) => [application.id, application]));
  const documentsByApplication = new Map<string, LoanDocument[]>();

  for (const document of documents) {
    const group = documentsByApplication.get(document.loan_application_uuid) ?? [];
    group.push(document);
    documentsByApplication.set(document.loan_application_uuid, group);
  }

  return [...documentsByApplication.entries()]
    .map(([applicationId, groupedDocuments]) => ({
      applicationId,
      application: applicationsById.get(applicationId) ?? null,
      documents: groupedDocuments,
    }))
    .sort((left, right) => {
      const leftOpened = left.application?.openedOn ?? "";
      const rightOpened = right.application?.openedOn ?? "";
      return rightOpened.localeCompare(leftOpened) || left.applicationId.localeCompare(right.applicationId);
    });
}
