"use client";

import * as React from "react";

import { uploadFileToPresignedPost } from "@/lib/agent-application";
import {
  confirmTaskDocument,
  deleteTaskDocument,
  listTaskDocuments,
  presignTaskDocument,
  type DocType,
  type TaskDocument,
} from "@/lib/employee-api";

type Status = "loading" | "ready" | "error";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const MAX_TASK_DOCUMENT_BYTES = 5 * 1024 * 1024;

export function useEmployeeTaskDocuments(taskId: string) {
  const [documents, setDocuments] = React.useState<TaskDocument[]>([]);
  const [status, setStatus] = React.useState<Status>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    const run = async () => {
      const res = await listTaskDocuments(taskId);
      if (!active) return;
      if (res.ok) {
        setDocuments(res.data);
        setStatus("ready");
        return;
      }
      setError(res.error);
      setStatus("error");
    };
    void run();
    return () => {
      active = false;
    };
  }, [taskId, reloadKey]);

  const retry = React.useCallback(() => {
    setStatus("loading");
    setError(null);
    setReloadKey((k) => k + 1);
  }, []);

  async function uploadDocument(
    file: File,
    docType: DocType,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
      return { ok: false, error: "Only JPEG, PNG, WebP, or PDF files are supported." };
    }
    if (file.size < 1 || file.size > MAX_TASK_DOCUMENT_BYTES) {
      return { ok: false, error: "Choose a non-empty file no larger than 5 MB." };
    }
    setUploading(true);
    try {
      const presignRes = await presignTaskDocument(taskId, {
        doc_type: docType,
        content_type: file.type as "image/jpeg" | "image/png" | "image/webp" | "application/pdf",
      });
      if (!presignRes.ok) return { ok: false, error: presignRes.error };

      const { object_key, upload_url, fields, max_bytes } = presignRes.data;
      if (file.size > max_bytes) {
        return { ok: false, error: "This file exceeds the server upload limit." };
      }
      const uploadRes = await uploadFileToPresignedPost(upload_url, fields, file);
      if (!uploadRes.ok) {
        return { ok: false, error: "Upload to storage failed. Please try again." };
      }

      const confirmRes = await confirmTaskDocument(taskId, { doc_type: docType, object_key });
      if (!confirmRes.ok) return { ok: false, error: confirmRes.error };

      retry();
      return { ok: true };
    } finally {
      setUploading(false);
    }
  }

  async function deleteDocument(
    documentId: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    setDeletingId(documentId);
    try {
      const res = await deleteTaskDocument(taskId, documentId);
      if (!res.ok) return { ok: false, error: res.error };
      retry();
      return { ok: true };
    } finally {
      setDeletingId(null);
    }
  }

  return { documents, status, error, retry, uploadDocument, uploading, deleteDocument, deletingId };
}
