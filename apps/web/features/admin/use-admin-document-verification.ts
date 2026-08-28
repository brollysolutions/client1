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

export type DocumentVerificationQuery = {
  onlyUnverified: boolean;
  businessLine?: "loans" | "real_estate";
  page: number;
};

export function useAdminDocumentVerification(query: DocumentVerificationQuery) {
  const [subjects, setSubjects] = React.useState<DocumentSubject[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Lazily loaded per-subject document list, keyed so a subject switch never
  // shows another subject's stale rows while the new fetch is in flight.
  const [documentsBySubject, setDocumentsBySubject] = React.useState<
    Record<string, VerifiableDocument[] | undefined>
  >({});
  const [documentsLoading, setDocumentsLoading] = React.useState<string | null>(null);

  const { onlyUnverified, businessLine, page } = query;

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listDocumentSubjects({
      onlyUnverified,
      businessLine,
      offset: page * 25,
    });
    if (res.ok) {
      setSubjects(res.data.subjects);
      setTotal(res.data.total);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, [businessLine, onlyUnverified, page]);

  React.useEffect(() => {
    void load();
  }, [load]);

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
      void load();
    }
    return res;
  }

  return {
    subjects,
    total,
    loading,
    error,
    reload: load,
    documentsBySubject,
    documentsLoading,
    loadDocuments,
    setVerification,
    subjectKey,
  };
}
