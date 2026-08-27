"use client";

import * as React from "react";
import Image from "next/image";
import { Camera, Download, FileText, ImageIcon, Loader2, Trash2, Upload, Video } from "lucide-react";
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
import { DashboardPanel } from "@/features/dashboard/dashboard-ui";
import { ListPagination, useListPagination } from "@/features/dashboard/list-pagination";
import { STATUS_STYLES, formatDate } from "@/features/dashboard/loan-format";
import { DOC_TYPE_LABEL, DOC_TYPE_OPTIONS, type DocTypeValue } from "@/lib/doc-types";
import { groupLoanMedia, LOAN_CAMERA_ACCEPT, LOAN_MEDIA_ACCEPT } from "@/lib/loan-media";
import { cn } from "@/lib/utils";

import { useLoanDocuments } from "./use-loan-documents";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function DocumentsView() {
  const {
    documents,
    applications,
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
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const groups = React.useMemo(
    () => groupLoanMedia(applications, documents),
    [applications, documents],
  );
  const { page, pageItems, setPage } = useListPagination(groups);

  async function handleFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const result = await uploadDocument(file, docType);
    if (result.ok) {
      toast.success("Loan media uploaded");
    } else {
      toast.error("Couldn’t upload loan media", { description: result.error });
    }
  }

  async function handleDelete(document: (typeof documents)[number]) {
    const result = await deleteDocument(document);
    if (result.ok) {
      toast.success("Loan media removed");
    } else {
      toast.error("Couldn’t remove loan media", { description: result.error });
    }
  }

  if (status === "loading") {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (status === "error") {
    return <FetchError status={null} message={error} onRetry={retry} />;
  }

  return (
    <div className="space-y-6">
      <DashboardPanel title="Add loan media" description="Files remain private to your loan workflow and authorized reviewers.">
        <div id="add-loan-media">
        {activeApplication ? (
          <>
            <p className="mt-1 text-sm text-text-secondary">
              Attach to {activeApplication.loanTypeLabel}. Images and PDFs can be up to 5 MiB;
              MP4 videos can be up to 20 MiB and 1 minute. Limit 12 files, including 2 videos.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="w-52">
                <label htmlFor="loan-doc-type" className="mb-1.5 block text-xs font-medium text-text-secondary">
                  Media type
                </label>
                <Select value={docType} onValueChange={(value) => setDocType(value as DocTypeValue)}>
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
                accept={LOAN_MEDIA_ACCEPT}
                className="hidden"
                onChange={(event) => void handleFileChosen(event)}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept={LOAN_CAMERA_ACCEPT}
                capture="environment"
                className="hidden"
                onChange={(event) => void handleFileChosen(event)}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="h-4 w-4" aria-hidden="true" />
                )}
                Upload file
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={uploading}
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera className="h-4 w-4" aria-hidden="true" />
                Take photo
              </Button>
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-text-secondary">
            You don’t have an active loan application to attach new media to. Media from prior
            applications remains available below.
          </p>
        )}
        </div>
      </DashboardPanel>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-loans-soft text-loans-accent">
            <ImageIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-text-primary">No loan media yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-text-secondary">
            Upload documents or photos for an active application. They remain private to your loan
            workflow and authorized reviewers.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {pageItems.map((group) => {
            const application = group.application;
            const applicationStatus = application ? STATUS_STYLES[application.status] : null;
            const headingId = `loan-media-${group.applicationId}`;
            return (
              <section
                key={group.applicationId}
                aria-labelledby={headingId}
                className="overflow-hidden rounded-2xl border border-border bg-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
                  <div>
                    <h2 id={headingId} className="font-semibold text-text-primary">
                      {application?.loanTypeLabel ?? "Loan application"}
                    </h2>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      {application ? `Applied ${formatDate(application.openedOn)}` : "Application details unavailable"}
                      {` · ${group.documents.length} ${group.documents.length === 1 ? "file" : "files"}`}
                    </p>
                  </div>
                  {applicationStatus ? (
                    <Badge className={applicationStatus.className}>{applicationStatus.label}</Badge>
                  ) : null}
                </div>

                <ul className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.documents.map((document) => {
                    const label =
                      DOC_TYPE_LABEL[document.doc_type as DocTypeValue] ?? document.doc_type;
                    const isImage = document.content_type.startsWith("image/");
                    const isVideo = document.content_type === "video/mp4";
                    const ready = document.processing_status === "ready";
                    return (
                      <li key={document.id} className="overflow-hidden rounded-xl border border-border">
                        {isImage && document.preview_url ? (
                          <a
                            href={document.preview_url}
                            target="_blank"
                            rel="noreferrer"
                            className="relative block aspect-video overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-loans-accent"
                            aria-label={`Open ${label} preview`}
                          >
                            <Image
                              src={document.preview_url}
                              alt={`${label} preview`}
                              fill
                              unoptimized
                              sizes="(min-width: 1024px) 300px, (min-width: 640px) 45vw, 90vw"
                              className="object-cover"
                            />
                          </a>
                        ) : isVideo && document.playback_url ? (
                          <video
                            src={document.playback_url}
                            controls
                            preload="metadata"
                            className="aspect-video w-full bg-black object-contain"
                            aria-label={`${label} video`}
                          />
                        ) : (
                          <div className="flex aspect-video items-center justify-center bg-muted text-text-secondary">
                            {isVideo ? (
                              ready ? (
                                <Video className="h-8 w-8" aria-hidden="true" />
                              ) : (
                                <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
                              )
                            ) : (
                              <FileText className="h-8 w-8" aria-hidden="true" />
                            )}
                          </div>
                        )}

                        <div className="space-y-3 p-3">
                          <div>
                            <p className="truncate text-sm font-medium text-text-primary">{label}</p>
                            <p className="text-xs text-text-secondary">
                              {formatDate(document.uploaded_at)} · {formatBytes(document.size_bytes)}
                            </p>
                          </div>
                          <div>
                            {!ready ? (
                              <Badge className={cn(document.processing_status === "failed" ? "bg-destructive/10 text-destructive" : "bg-muted text-text-secondary")}>
                                {document.processing_status === "failed" ? "Processing failed" : "Processing"}
                              </Badge>
                            ) : <Badge
                              className={cn(
                                document.verified
                                  ? "bg-success/10 text-success"
                                  : document.review_note
                                    ? "bg-warning/10 text-warning"
                                    : "bg-muted text-text-secondary",
                              )}
                            >
                              {document.verified
                                ? "Verified"
                                : document.review_note
                                  ? "Needs attention"
                                  : "Awaiting review"}
                            </Badge>}
                            {document.review_note ? (
                              <p className="mt-2 text-xs text-warning">{document.review_note}</p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            {document.download_url ? (
                              <Button asChild type="button" size="sm" variant="outline" className="flex-1">
                                <a href={document.download_url} target="_blank" rel="noreferrer">
                                  <Download className="h-4 w-4" aria-hidden="true" />
                                  Download
                                </a>
                              </Button>
                            ) : (
                              <Button type="button" size="sm" variant="outline" className="flex-1" disabled>
                                <Download className="h-4 w-4" aria-hidden="true" />
                                Unavailable
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={document.verified || deletingId === document.id}
                              aria-label={`Remove ${label}`}
                              title={document.verified ? "A verified file can’t be removed" : undefined}
                              onClick={() => void handleDelete(document)}
                            >
                              {deletingId === document.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                              ) : (
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          <ListPagination page={page} total={groups.length} onPageChange={setPage} label="Loan media application pages" />
        </div>
      )}
    </div>
  );
}
