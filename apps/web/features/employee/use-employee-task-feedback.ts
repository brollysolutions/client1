"use client";

import * as React from "react";

import { uploadFileToPresignedPost } from "@/lib/agent-application";
import {
  confirmTaskFeedbackMedia,
  deleteTaskFeedbackMedia,
  listTaskFeedbackMedia,
  presignTaskFeedbackMedia,
  type TaskFeedbackMedia,
} from "@/lib/employee-api";

const CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_BYTES = 5 * 1024 * 1024;

export function useEmployeeTaskFeedback(taskId: string) {
  const [items, setItems] = React.useState<TaskFeedbackMedia[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    void listTaskFeedbackMedia(taskId).then((result) => {
      if (!active) return;
      if (result.ok) {
        setItems(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [reloadKey, taskId]);

  const reload = React.useCallback(() => {
    setLoading(true);
    setReloadKey((value) => value + 1);
  }, []);

  async function upload(file: File): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!CONTENT_TYPES.has(file.type)) {
      return { ok: false, error: "Choose a JPEG, PNG, WebP, or PDF file." };
    }
    if (file.size < 1 || file.size > MAX_BYTES) {
      return { ok: false, error: "The attachment must be between 1 byte and 5 MiB." };
    }
    setUploading(true);
    try {
      const contentType = file.type as "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
      const presign = await presignTaskFeedbackMedia(taskId, { content_type: contentType });
      if (!presign.ok) return { ok: false, error: presign.error };
      const uploaded = await uploadFileToPresignedPost(
        presign.data.upload_url,
        presign.data.fields,
        file,
      );
      if (!uploaded.ok) return { ok: false, error: "Upload to storage failed. Try again." };
      const confirmed = await confirmTaskFeedbackMedia(taskId, {
        object_key: presign.data.object_key,
        content_type: contentType,
      });
      if (!confirmed.ok) return { ok: false, error: confirmed.error };
      reload();
      return { ok: true };
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
    setDeletingId(id);
    try {
      const result = await deleteTaskFeedbackMedia(taskId, id);
      if (!result.ok) return { ok: false, error: result.error };
      reload();
      return { ok: true };
    } finally {
      setDeletingId(null);
    }
  }

  return { items, loading, error, uploading, deletingId, upload, remove, reload };
}
