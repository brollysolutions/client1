"use client";

import * as React from "react";
import { CheckCheck, ExternalLink, FileCheck2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DashboardHeader, DashboardPage, DashboardPanel } from "@/features/dashboard/dashboard-ui";
import {
  DataTable,
  DataTablePrimaryCell,
  nextSort,
  type DataColumn,
  type SortState,
} from "@/features/dashboard/data-table";
import { FetchError } from "@/features/dashboard/fetch-error";
import {
  EMPTY_FILTERS,
  FilterBar,
  filtersAreActive,
  matchesSearch,
  type FilterBarValue,
} from "@/features/dashboard/filter-bar";
import {
  ListEmptyState,
  ListLoadingState,
  ListPagination,
  ListSpinner,
} from "@/features/dashboard/list-states";
import { StatusBadge } from "@/features/dashboard/status-badge";
import { LIST_PAGE_SIZE } from "@/features/dashboard/use-filtered-page";
import { WORKSPACE_DIALOG_CLASS, WorkspaceDialogHeader } from "@/features/dashboard/workspace-dialog";
import type { DocumentSubject, VerifiableDocument } from "@/lib/admin-document-verification-api";
import { isInDateRange } from "@/lib/date-range";
import { DOC_TYPE_LABEL, type DocTypeValue } from "@/lib/doc-types";
import { formatAge, formatDate } from "@/lib/format";
import { optionalTextError, requiredTextError } from "@/lib/form-validation";

import { useAdminDocumentVerification } from "./use-admin-document-verification";

const LINE_LABEL: Record<string, string> = { loans: "Loans", real_estate: "Real Estate" };

const SOURCE_LABEL: Record<string, string> = {
  task: "Field task",
  loan_application: "Client upload",
};

const SOURCE_OPTIONS = [
  { value: "task", label: "Field task" },
  { value: "loan_application", label: "Client upload" },
];

const DEFAULT_FILTERS: FilterBarValue = { ...EMPTY_FILTERS, status: "unverified" };

const STATUS_OPTIONS = [
  { value: "unverified", label: "Needs review" },
  { value: "any", label: "Reviewed and pending" },
];

/**
 * Renders a document inline where the browser can, so the reviewer decides from
 * the artefact rather than from its filename. Images and PDFs cover every
 * accepted upload type; anything else falls back to a download link.
 */
function DocumentPreview({ document }: { document: VerifiableDocument }) {
  const [failed, setFailed] = React.useState(false);
  const isPdf = /\.pdf(\?|$)/i.test(document.download_url);

  if (failed) {
    return (
      <div className="flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
        <p className="text-sm text-text-secondary">
          This file can&rsquo;t be previewed here.{" "}
          <a
            href={document.download_url}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-brand-cta hover:underline"
          >
            Open it in a new tab
          </a>
          .
        </p>
      </div>
    );
  }

  if (isPdf) {
    return (
      <object
        data={document.download_url}
        type="application/pdf"
        className="h-96 w-full rounded-lg border border-border bg-muted/30"
        aria-label={`${DOC_TYPE_LABEL[document.doc_type as DocTypeValue] ?? document.doc_type} preview`}
      >
        <div className="flex h-full items-center justify-center p-6 text-center">
          <a
            href={document.download_url}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-brand-cta hover:underline"
          >
            Open this PDF in a new tab
          </a>
        </div>
      </object>
    );
  }

  return (
    // Presigned storage URLs expire in minutes and are not a configured
    // next/image remote pattern, so this stays a plain <img>.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={document.download_url}
      alt={`${DOC_TYPE_LABEL[document.doc_type as DocTypeValue] ?? document.doc_type} preview`}
      className="max-h-96 w-full rounded-lg border border-border bg-muted/30 object-contain"
      onError={() => setFailed(true)}
    />
  );
}

export function DocumentVerificationView() {
  const [filters, setFilters] = React.useState<FilterBarValue>(DEFAULT_FILTERS);
  const [sort, setSort] = React.useState<SortState>({ key: "latest_upload_at", dir: "desc" });
  const [page, setPage] = React.useState(0);
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const [noteDraftByDoc, setNoteDraftByDoc] = React.useState<Record<string, string>>({});
  const [noteErrorByDoc, setNoteErrorByDoc] = React.useState<Record<string, string>>({});
  const [busyDocId, setBusyDocId] = React.useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = React.useState(false);

  const {
    subjects,
    total,
    loading,
    error,
    reload,
    documentsBySubject,
    documentsLoading,
    loadDocuments,
    setVerification,
    subjectKey,
  } = useAdminDocumentVerification({
    onlyUnverified: filters.status !== "any",
    businessLine: filters.line === "all" ? undefined : (filters.line as "loans" | "real_estate"),
    page,
  });

  // Line and status are server-side; resetting the page keeps a narrowed filter
  // from stranding the reviewer past the end of the new result set.
  React.useEffect(() => {
    setPage(0);
  }, [filters.line, filters.status]);

  // Search, source and date narrow the fetched page in the browser. The route
  // has no predicate for them, and paging server-side while filtering client-
  // side would silently hide matches — so the panel says what is being searched.
  const visible = React.useMemo(() => {
    const rows = subjects.filter(
      (subject) =>
        isInDateRange(subject.latest_upload_at, filters.from, filters.to) &&
        (filters.kind === "all" || subject.source === filters.kind) &&
        matchesSearch(
          `${subject.lead_name ?? ""} ${subject.lead_mobile_masked} ${subject.subject_label}`,
          filters.search,
        ),
    );
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sort.key) {
        case "lead_name":
          return (a.lead_name ?? "").localeCompare(b.lead_name ?? "") * direction;
        case "progress":
          return (
            (a.verified_count / Math.max(a.total_count, 1) -
              b.verified_count / Math.max(b.total_count, 1)) *
            direction
          );
        default:
          return (
            (new Date(a.latest_upload_at).getTime() - new Date(b.latest_upload_at).getTime()) *
            direction
          );
      }
    });
  }, [filters, sort, subjects]);

  const active = activeKey
    ? subjects.find((subject) => subjectKey(subject.source, subject.subject_uuid) === activeKey) ??
      null
    : null;
  const activeDocuments = activeKey ? documentsBySubject[activeKey] : undefined;
  const pendingDocuments = (activeDocuments ?? []).filter((document) => !document.verified);

  function openSubject(subject: DocumentSubject) {
    setActiveKey(subjectKey(subject.source, subject.subject_uuid));
    void loadDocuments(subject.source, subject.subject_uuid);
  }

  async function handleVerify(document: VerifiableDocument, verified: boolean) {
    if (!active) return;
    const note = noteDraftByDoc[document.document_id]?.trim() || null;
    const validationError = verified
      ? optionalTextError(note ?? "", "Review note", 1000)
      : requiredTextError(note ?? "", "Review note", 1000);
    setNoteErrorByDoc((current) => {
      const next = { ...current };
      if (validationError) next[document.document_id] = validationError;
      else delete next[document.document_id];
      return next;
    });
    if (validationError) return;
    setBusyDocId(document.document_id);
    const res = await setVerification(
      document.source,
      document.document_id,
      { verified, review_note: note },
      active.subject_uuid,
    );
    setBusyDocId(null);
    if (res.ok) {
      toast.success(verified ? "Marked verified" : "Sent back for re-collection");
    } else {
      toast.error("Couldn't update this document", { description: res.error });
    }
  }

  // Verify-all only ever moves documents forward, and un-verifying always needs
  // a per-document note, so there is deliberately no bulk counterpart to it.
  async function verifyAllPending() {
    if (!active || pendingDocuments.length === 0) return;
    setBulkBusy(true);
    let failures = 0;
    for (const document of pendingDocuments) {
      const res = await setVerification(
        document.source,
        document.document_id,
        { verified: true, review_note: null },
        active.subject_uuid,
      );
      if (!res.ok) failures += 1;
    }
    setBulkBusy(false);
    if (failures === 0) {
      toast.success(
        `Verified ${pendingDocuments.length} ${pendingDocuments.length === 1 ? "document" : "documents"}`,
      );
    } else {
      toast.error(`${failures} of ${pendingDocuments.length} could not be verified`);
    }
  }

  const columns: DataColumn<DocumentSubject>[] = [
    {
      key: "lead_name",
      header: "Lead",
      sortable: true,
      cellClassName: "max-w-[18rem]",
      render: (subject) => (
        <DataTablePrimaryCell
          title={subject.lead_name ?? "Unknown lead"}
          subtitle={subject.lead_mobile_masked}
        />
      ),
    },
    {
      key: "subject_label",
      header: "Subject",
      cellClassName: "max-w-[18rem]",
      render: (subject) => (
        <span className="block truncate text-text-secondary">{subject.subject_label}</span>
      ),
    },
    {
      key: "source",
      header: "Source",
      render: (subject) => (
        <span className="text-text-secondary">{SOURCE_LABEL[subject.source] ?? subject.source}</span>
      ),
    },
    {
      key: "business_line",
      header: "Line",
      render: (subject) => (
        <span className="text-text-secondary">
          {LINE_LABEL[subject.business_line] ?? subject.business_line}
        </span>
      ),
    },
    {
      key: "progress",
      header: "Verified",
      sortable: true,
      render: (subject) => (
        <StatusBadge tone={subject.verified_count === subject.total_count ? "success" : "warning"}>
          {subject.verified_count} of {subject.total_count}
        </StatusBadge>
      ),
    },
    {
      key: "latest_upload_at",
      header: "Latest upload",
      sortable: true,
      align: "right",
      render: (subject) => (
        <span
          className="tabular-nums text-text-secondary"
          title={formatDate(subject.latest_upload_at)}
        >
          {formatAge(subject.latest_upload_at)}
        </span>
      ),
    },
  ];

  return (
    <DashboardPage>
      <DashboardHeader
        title="Document verification"
        description="Confirm the documents collected in the field and uploaded by clients are complete and usable."
      />

      <FilterBar
        value={filters}
        onChange={setFilters}
        searchLabel="Search document subjects"
        searchPlaceholder="Lead, mobile, or subject"
        statusOptions={STATUS_OPTIONS}
        statusLabel="review states"
        kindOptions={SOURCE_OPTIONS}
        kindLabel="Sources"
        lineOptions={[
          { value: "loans", label: "Loans" },
          { value: "real_estate", label: "Real Estate" },
        ]}
        dateFromLabel="Uploaded from"
        dateToLabel="Uploaded to"
        note="Review state and business line narrow the query; search, source, and dates narrow the page below."
      />

      {loading ? (
        <ListLoadingState />
      ) : error ? (
        <FetchError status={null} message={error} onRetry={() => void reload()} />
      ) : visible.length === 0 ? (
        <ListEmptyState
          icon={FileCheck2}
          title={
            filtersAreActive(filters)
              ? "Nothing matches these filters"
              : "Nothing is waiting for review"
          }
          description={
            filtersAreActive(filters)
              ? "Try a different search, review state, source, line, or upload date."
              : "Documents collected in the field or uploaded by clients arrive here."
          }
        />
      ) : (
        <DashboardPanel
          title="Document subjects"
          description={`${visible.length} shown of ${total} matching`}
          bodyClassName="p-0"
        >
          <DataTable
            columns={columns}
            rows={visible}
            rowKey={(subject) => subjectKey(subject.source, subject.subject_uuid)}
            sort={sort}
            onSortChange={(key) => setSort((current) => nextSort(current, key))}
            onRowClick={openSubject}
            rowActionLabel="Review documents"
            minWidth="min-w-[960px]"
          />
          <div className="px-5 pb-4">
            <ListPagination
              page={page}
              total={total}
              onPageChange={setPage}
              pageSize={LIST_PAGE_SIZE}
            />
          </div>
        </DashboardPanel>
      )}

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActiveKey(null)}>
        <DialogContent showCloseButton={false} className={WORKSPACE_DIALOG_CLASS}>
          {active ? (
            <>
              <WorkspaceDialogHeader
                title={active.subject_label}
                description={`${active.lead_name ?? "Unknown lead"} · ${active.lead_mobile_masked} · ${SOURCE_LABEL[active.source] ?? active.source}`}
                closeLabel="Close document review"
                actions={
                  pendingDocuments.length > 0 ? (
                    <Button size="sm" disabled={bulkBusy} onClick={() => void verifyAllPending()}>
                      {bulkBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <CheckCheck className="h-4 w-4" aria-hidden="true" />
                      )}
                      Verify all {pendingDocuments.length}
                    </Button>
                  ) : (
                    <StatusBadge tone="success">All verified</StatusBadge>
                  )
                }
              />

              <div className="min-h-0 overflow-y-auto py-2">
                {documentsLoading === activeKey ? (
                  <ListSpinner />
                ) : !activeDocuments || activeDocuments.length === 0 ? (
                  <p className="py-10 text-center text-sm text-text-secondary">
                    No documents found for this subject.
                  </p>
                ) : (
                  <ul className="space-y-4">
                    {activeDocuments.map((document) => (
                      <li
                        key={document.document_id}
                        className="grid gap-4 rounded-xl border border-border p-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]"
                      >
                        <div className="min-w-0">
                          <DocumentPreview document={document} />
                        </div>

                        <div className="min-w-0 space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium text-text-primary">
                                {DOC_TYPE_LABEL[document.doc_type as DocTypeValue] ??
                                  document.doc_type}
                              </p>
                              <p className="text-xs text-text-secondary">
                                Uploaded {formatDate(document.uploaded_at)}
                                {document.verified_by_name
                                  ? ` · reviewed by ${document.verified_by_name}`
                                  : ""}
                              </p>
                            </div>
                            <StatusBadge tone={document.verified ? "success" : "warning"}>
                              {document.verified ? "Verified" : "Needs review"}
                            </StatusBadge>
                          </div>

                          <a
                            href={document.download_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-cta hover:underline"
                          >
                            Open the original
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          </a>

                          {document.review_note ? (
                            <p className="rounded-lg bg-muted/40 p-3 text-xs text-text-secondary">
                              Note: {document.review_note}
                            </p>
                          ) : null}

                          <div className="space-y-2">
                            <Textarea
                              value={noteDraftByDoc[document.document_id] ?? ""}
                              onChange={(event) => {
                                setNoteDraftByDoc((prev) => ({
                                  ...prev,
                                  [document.document_id]: event.target.value,
                                }));
                                setNoteErrorByDoc((current) => {
                                  const next = { ...current };
                                  delete next[document.document_id];
                                  return next;
                                });
                              }}
                              aria-invalid={Boolean(noteErrorByDoc[document.document_id])}
                              aria-describedby={
                                noteErrorByDoc[document.document_id]
                                  ? `document-${document.document_id}-note-error`
                                  : undefined
                              }
                              placeholder="Note (required if sending back for re-collection)"
                              rows={2}
                              maxLength={1000}
                            />
                            <FieldError id={`document-${document.document_id}-note-error`}>
                              {noteErrorByDoc[document.document_id]}
                            </FieldError>
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busyDocId === document.document_id || bulkBusy}
                                onClick={() => void handleVerify(document, false)}
                              >
                                Needs re-collect
                              </Button>
                              <Button
                                size="sm"
                                disabled={
                                  busyDocId === document.document_id || bulkBusy || document.verified
                                }
                                onClick={() => void handleVerify(document, true)}
                              >
                                {busyDocId === document.document_id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                ) : null}
                                Verify
                              </Button>
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </DashboardPage>
  );
}
