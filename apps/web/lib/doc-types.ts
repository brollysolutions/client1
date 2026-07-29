// Shared KYC doc-type label map — extracted from
// features/employee/employee-task-document-panel.tsx so the employee panel,
// the client documents page, and the (future) admin verification console
// can't drift on labels for the same underlying vocabulary
// (schemas/employee.DocTypeLiteral / schemas/loan_documents.LoanDocTypeLiteral,
// both the same 8-value list).

export type DocTypeValue =
  | "aadhaar_front"
  | "aadhaar_back"
  | "pan"
  | "salary_slip"
  | "bank_statement"
  | "sale_deed"
  | "photo"
  | "other";

export const DOC_TYPE_LABEL: Record<DocTypeValue, string> = {
  aadhaar_front: "Aadhaar (front)",
  aadhaar_back: "Aadhaar (back)",
  pan: "PAN card",
  salary_slip: "Salary slip",
  bank_statement: "Bank statement",
  sale_deed: "Sale deed",
  photo: "Photo",
  other: "Other",
};

export const DOC_TYPE_OPTIONS = Object.keys(DOC_TYPE_LABEL) as DocTypeValue[];
