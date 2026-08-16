"use client";

import * as React from "react";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DOC_TYPE_LABEL, DOC_TYPE_OPTIONS } from "@/lib/doc-types";
import type { DocType } from "@/lib/employee-api";

import { useEmployeeTaskDocuments } from "./use-employee-task-documents";

export function EmployeeTaskDocumentPanel({
  taskId,
  disabled,
}: {
  taskId: string;
  disabled: boolean;
}) {
  const { documents, status, error, retry, uploadDocument, uploading, deleteDocument, deletingId } =
    useEmployeeTaskDocuments(taskId);
  const [docType, setDocType] = React.useState<DocType>("other");
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

  async function handleDelete(documentId: string) {
    const res = await deleteDocument(documentId);
    if (res.ok) {
      toast.success("Document removed");
    } else {
      toast.error("Couldn't remove document", { description: res.error });
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-text-primary">Documents</h2>

      {!disabled && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="w-48">
            <Label htmlFor="doc-type">Document type</Label>
            <Select value={docType} onValueChange={(v) => setDocType(v as DocType)}>
              <SelectTrigger id="doc-type">
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
          <p className="text-xs text-text-secondary">JPEG, PNG, WebP, or PDF up to 5 MB.</p>
        </div>
      )}

      <div className="mt-4">
        {status === "loading" ? (
          <div className="space-y-2">
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
          </div>
        ) : status === "error" ? (
          <div className="flex items-center justify-between gap-3 text-sm text-text-secondary">
            <span>{error ?? "Couldn't load documents."}</span>
            <Button type="button" size="sm" variant="outline" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : documents.length === 0 ? (
          <p className="text-sm text-text-secondary">No documents collected yet.</p>
        ) : (
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li key={doc.id} className="rounded-lg border border-border px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <a
                    href={doc.download_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center gap-2 text-sm text-text-primary hover:underline"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-text-secondary" />
                    <span className="truncate">
                      {DOC_TYPE_LABEL[doc.doc_type as DocType] ?? doc.doc_type}
                    </span>
                  </a>
                  <div className="flex shrink-0 items-center gap-2">
                    {doc.verified ? (
                      <Badge className="bg-success/10 text-success">Verified</Badge>
                    ) : null}
                    {!disabled && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={deletingId === doc.id}
                        onClick={() => void handleDelete(doc.id)}
                      >
                        {deletingId === doc.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                {doc.review_note ? (
                  <p className="mt-1.5 text-xs text-warning">Needs re-upload: {doc.review_note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
