"use client";

import * as React from "react";

import {
  listDocumentSubjects,
  listVerifiableDocuments,
  verifyDocument,
  type DocumentSource,
  type DocumentSubject,
  type DocumentVerifyRequest,
  type VerifiableDocument,
} from "@/lib/admin-document-verification-api";
import type { ApiResponse } from "@/lib/api/client";

function subjectKey(source: DocumentSource, subjectUuid: string): string {
  return `${source}:${subjectUuid}`;
}

export function useAdminDocumentVerification() {
  const [subjects, setSubjects] = React.useState<DocumentSubject[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [onlyUnverified, setOnlyUnverified] = React.useState(true);

  // Lazily loaded per-subject document list, keyed so a subject switch never
  // shows another subject's stale rows while the new fetch is in flight.
  const [documentsBySubject, setDocumentsBySubject] = React.useState<
    Record<string, VerifiableDocument[] | undefined>
  >({});
  const [documentsLoading, setDocumentsLoading] = React.useState<string | null>(null);

  const load = React.useCallback(async (unverifiedOnly: boolean) => {
    setLoading(true);
    setError(null);
    const res = await listDocumentSubjects(unverifiedOnly);
    if (res.ok) {
      setSubjects(res.data);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load(onlyUnverified);
  }, [load, onlyUnverified]);

  async function loadDocuments(source: DocumentSource, subjectUuid: string) {
    const key = subjectKey(source, subjectUuid);
    setDocumentsLoading(key);
    const res = await listVerifiableDocuments(source, subjectUuid);
    if (res.ok) {
      setDocumentsBySubject((prev) => ({ ...prev, [key]: res.data }));
    }
    setDocumentsLoading(null);
    return res;
  }

  async function setVerification(
    source: DocumentSource,
    documentId: string,
    body: DocumentVerifyRequest,
    subjectUuid: string,
  ): Promise<ApiResponse<VerifiableDocument>> {
    const res = await verifyDocument(source, documentId, body);
    if (res.ok) {
      void loadDocuments(source, subjectUuid);
      void load(onlyUnverified);
    }
    return res;
  }

  return {
    subjects,
    loading,
    error,
    onlyUnverified,
    setOnlyUnverified,
    reload: () => load(onlyUnverified),
    documentsBySubject,
    documentsLoading,
    loadDocuments,
    setVerification,
    subjectKey,
  };
}
