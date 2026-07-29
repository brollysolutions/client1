"use client";

import * as React from "react";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";
import { DOC_TYPE_LABEL, DOC_TYPE_OPTIONS, type DocTypeValue } from "@/lib/doc-types";

import { useLoanDocuments } from "./use-loan-documents";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function DocumentsView() {
  const {
    documents,
    activeApplication,
    status,
    error,
    retry,
    uploadDocument,
    uploading,
    deleteDocument,
    deletingId,
  } = useLoanDocuments();
  const [docType, setDocType] = React.useState<DocTypeValue>("other");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const res = await uploadDocument(file, docType);
    if (res.ok) {
      toast.success("Document uploaded");
    } else {
      toast.error("Couldn't upload document", { description: res.error });
    }
  }

  async function handleDelete(document: (typeof documents)[number]) {
    const res = await deleteDocument(document);
    if (res.ok) {
      toast.success("Document removed");
    } else {
      toast.error("Couldn't remove document", { description: res.error });
    }
  }

  if (status === "loading") {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
    );
  }

  if (status === "error") {
    return <FetchError status={null} message={error} onRetry={retry} />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-text-primary">Add a document</h2>
        {activeApplication ? (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="w-48">
              <Select value={docType} onValueChange={(v) => setDocType(v as DocTypeValue)}>
                <SelectTrigger id="loan-doc-type">
                  <SelectValue placeholder="Choose type" />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPE_OPTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {DOC_TYPE_LABEL[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => void handleFileChosen(e)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Upload file
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-text-secondary">
            You don&apos;t have an active loan application to attach documents to.
          </p>
        )}
      </div>

      <div>
        {documents.length === 0 ? (
          <p className="text-sm text-text-secondary">No documents uploaded yet.</p>
        ) : (
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-text-secondary" />
                  <div className="min-w-0">
                    <a
                      href={doc.download_url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-sm font-medium text-text-primary hover:underline"
                    >
                      {DOC_TYPE_LABEL[doc.doc_type as DocTypeValue] ?? doc.doc_type}
                    </a>
                    <p className="text-xs text-text-secondary">{formatDate(doc.uploaded_at)}</p>
                    {doc.review_note ? (
                      <p className="text-xs text-warning">Needs re-upload: {doc.review_note}</p>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {doc.verified ? (
                    <Badge className="bg-success/10 text-success">Verified</Badge>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={doc.verified || deletingId === doc.id}
                    title={doc.verified ? "A verified document can't be removed" : undefined}
                    onClick={() => void handleDelete(doc)}
                  >
                    {deletingId === doc.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
