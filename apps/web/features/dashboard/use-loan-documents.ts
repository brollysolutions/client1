"use client";

import * as React from "react";

import {
  deleteLoanDocument,
  listOwnLoanDocuments,
  uploadLoanDocuments,
  type LoanDocType,
  type LoanDocument,
} from "@/lib/loan-documents";
import { getLoanApplications, type LoanApplication } from "@/lib/loans";

type Status = "loading" | "ready" | "error";

function findActiveApplication(applications: LoanApplication[]): LoanApplication | null {
  return applications.find((a) => a.status !== "closed" && a.status !== "rejected") ?? null;
}

// Mirrors features/employee/use-employee-task-documents.ts's shape, extended
// with a second parallel fetch (the client's applications, to find the one
// active application new uploads attach to — see documents-view.tsx).
export function useLoanDocuments() {
  const [documents, setDocuments] = React.useState<LoanDocument[]>([]);
  const [activeApplication, setActiveApplication] = React.useState<LoanApplication | null>(null);
  const [status, setStatus] = React.useState<Status>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    const run = async () => {
      const [docsRes, appsRes] = await Promise.all([
        listOwnLoanDocuments(),
        getLoanApplications(),
      ]);
      if (!active) return;
      if (!docsRes.ok) {
        setError(docsRes.error);
        setStatus("error");
        return;
      }
      setDocuments(docsRes.data);
      setActiveApplication(appsRes.ok ? findActiveApplication(appsRes.data) : null);
      setStatus("ready");
    };
    void run();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const retry = React.useCallback(() => {
    setStatus("loading");
    setError(null);
    setReloadKey((k) => k + 1);
  }, []);

  async function uploadDocument(
    file: File,
    docType: LoanDocType,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!activeApplication) {
      return { ok: false, error: "No active application to attach this document to." };
    }
    setUploading(true);
    try {
      const { failed } = await uploadLoanDocuments(activeApplication.id, [{ docType, file }]);
      if (failed.length > 0) {
        return { ok: false, error: "Upload to storage failed. Please try again." };
      }
      retry();
      return { ok: true };
    } finally {
      setUploading(false);
    }
  }

  async function deleteDocument(
    document: LoanDocument,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    setDeletingId(document.id);
    try {
      const res = await deleteLoanDocument(document.loan_application_uuid, document.id);
      if (!res.ok) return { ok: false, error: res.error };
      retry();
      return { ok: true };
    } finally {
      setDeletingId(null);
    }
  }

  return {
    documents,
    activeApplication,
    status,
    error,
    retry,
    uploadDocument,
    uploading,
    deleteDocument,
    deletingId,
  };
}
