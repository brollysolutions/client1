"use client";

import * as React from "react";
import { CheckCircle2, Download, FileWarning, Inbox, Loader2, XCircle } from "lucide-react";
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
import { ListEmptyState, ListLoadingState, ListPagination } from "@/features/dashboard/list-states";
import { StatusBadge, type StatusTone } from "@/features/dashboard/status-badge";
import { useFilteredPage } from "@/features/dashboard/use-filtered-page";
import {
  WORKSPACE_DIALOG_CLASS,
  WorkspaceDialogHeader,
  WorkspaceLayout,
} from "@/features/dashboard/workspace-dialog";
import { isInDateRange } from "@/lib/date-range";
import { formatAge, formatDate } from "@/lib/format";
import { requiredTextError } from "@/lib/form-validation";
import { formatMobile } from "@/lib/phone";
import {
  approveAgentApplication,
  rejectAgentApplication,
  type AgentApplication,
  type AgentApplicationDocument,
} from "@/lib/admin-api";

import { TempCredentialPanel } from "./temp-credential-panel";
import { useAgentApplicationDetail } from "./use-agent-application-detail";
import { useAgentQueue } from "./use-agent-queue";

const DOC_LABELS: Record<AgentApplicationDocument["doc_type"], string> = {
  aadhaar_front: "Aadhaar (front)",
  aadhaar_back: "Aadhaar (back)",
  pan: "PAN card",
  photo: "Photo",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_TONE: Record<string, StatusTone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const DEFAULT_FILTERS: FilterBarValue = { ...EMPTY_FILTERS, status: "pending" };

/**
 * KYC document tile.
 *
 * Presigned download URLs expire in about five minutes, so the detail fetch is
 * deliberately per-open rather than baked into the list. Photos and Aadhaar
 * scans are worth seeing before deciding, so images render inline and anything
 * that will not load falls back to the download the queue always offered.
 */
function DocumentTile({ document }: { document: AgentApplicationDocument & { download_url: string } }) {
  const [failed, setFailed] = React.useState(false);
  const label = DOC_LABELS[document.doc_type];

  return (
    <li className="overflow-hidden rounded-xl border border-border">
      <div className="flex h-44 items-center justify-center bg-muted/40">
        {failed ? (
          <span className="px-4 text-center text-xs text-text-secondary">
            Preview unavailable — use the download below.
          </span>
        ) : (
          // Presigned storage URLs are short-lived and not a configured
          // next/image remote pattern, so this stays a plain <img>.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={document.download_url}
            alt={`${label} preview`}
            className="max-h-44 w-full object-contain"
            onError={() => setFailed(true)}
          />
        )}
      </div>
      <a
        href={document.download_url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 border-t border-border px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:text-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue"
      >
        <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </a>
    </li>
  );
}

export function AgentQueueView() {
  const [filters, setFilters] = React.useState<FilterBarValue>(DEFAULT_FILTERS);
  const [sort, setSort] = React.useState<SortState>({ key: "created_at", dir: "asc" });
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [rejecting, setRejecting] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [noteError, setNoteError] = React.useState<string>();
  const [busy, setBusy] = React.useState(false);
  const [approved, setApproved] = React.useState<{
    mobile: string;
    agentCode: string;
    tempPassword: string | null;
  } | null>(null);

  const { items, loading, error, reload } = useAgentQueue(
    filters.status === "all" ? "all" : (filters.status as "pending" | "approved" | "rejected"),
  );

  const {
    detail,
    loading: detailLoading,
    error: detailError,
    reload: reloadDetail,
  } = useAgentApplicationDetail(activeId);

  const filtered = React.useMemo(() => {
    const rows = items.filter(
      (application) =>
        (filters.line === "all" || application.business_line === filters.line) &&
        isInDateRange(application.created_at, filters.from, filters.to) &&
        matchesSearch(
          `${application.first_name ?? ""} ${application.last_name ?? ""} ${application.rera_code ?? ""} ${application.mobile ?? ""}`,
          filters.search,
        ),
    );
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sort.key) {
        case "name":
          return (
            `${a.first_name ?? ""} ${a.last_name ?? ""}`.localeCompare(
              `${b.first_name ?? ""} ${b.last_name ?? ""}`,
            ) * direction
          );
        case "status":
          return a.status.localeCompare(b.status) * direction;
        default:
          return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * direction;
      }
    });
  }, [filters, items, sort]);

  const { page, setPage, pageRows, total } = useFilteredPage(filtered, filters);
  const active = activeId ? items.find((item) => item.id === activeId) ?? null : null;

  function openApplication(application: AgentApplication) {
    setActiveId(application.id);
    setRejecting(false);
    setNote("");
    setNoteError(undefined);
  }

  async function onApprove(application: AgentApplication) {
    setBusy(true);
    const res = await approveAgentApplication(application.id);
    setBusy(false);
    if (res.ok) {
      toast.success("Agent approved", { description: `${res.data.agent_code} is now active.` });
      setApproved({
        mobile: application.mobile ?? "the applicant",
        agentCode: res.data.agent_code,
        tempPassword: res.data.temp_password,
      });
      setActiveId(null);
      void reload();
    } else {
      toast.error("Could not approve", { description: res.error });
    }
  }

  async function onReject(application: AgentApplication) {
    const validationError = requiredTextError(note, "Rejection reason", 1000);
    setNoteError(validationError);
    if (validationError) return;
    setBusy(true);
    const res = await rejectAgentApplication(application.id, note.trim());
    setBusy(false);
    if (res.ok) {
      toast.success("Application rejected");
      setActiveId(null);
      setRejecting(false);
      setNote("");
      setNoteError(undefined);
      void reload();
    } else {
      toast.error("Could not reject", { description: res.error });
    }
  }

  const columns: DataColumn<AgentApplication>[] = [
    {
      key: "name",
      header: "Applicant",
      sortable: true,
      cellClassName: "max-w-[20rem]",
      render: (application) => (
        <DataTablePrimaryCell
          title={`${application.first_name ?? ""} ${application.last_name ?? ""}`.trim() ||
            "Unnamed applicant"}
          subtitle={application.mobile ? formatMobile(application.mobile) : "No mobile"}
        />
      ),
    },
    {
      key: "business_line",
      header: "Line",
      render: (application) => (
        <span className="text-text-secondary">
          {application.business_line === "loans" ? "Loans" : "Real Estate"}
        </span>
      ),
    },
    {
      key: "rera_code",
      header: "RERA code",
      render: (application) => (
        <span className="text-text-secondary">{application.rera_code ?? "-"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (application) => (
        <StatusBadge tone={STATUS_TONE[application.status] ?? "neutral"}>
          {STATUS_LABEL[application.status] ?? application.status}
        </StatusBadge>
      ),
    },
    {
      key: "created_at",
      header: "Waiting",
      sortable: true,
      align: "right",
      render: (application) => (
        <span
          className="tabular-nums text-text-secondary"
          title={formatDate(application.created_at)}
        >
          {application.status === "pending"
            ? formatAge(application.created_at)
            : formatDate(application.created_at)}
        </span>
      ),
    },
  ];

  return (
    <DashboardPage>
      <DashboardHeader
        title="Agent applications"
        description="Approve a pending application into a live agent account, or reject it with a reason."
      />

      {approved ? (
        <div className="space-y-3">
          {approved.tempPassword ? (
            <TempCredentialPanel mobile={approved.mobile} tempPassword={approved.tempPassword} />
          ) : (
            <p className="rounded-xl border border-border bg-card p-4 text-sm text-text-secondary">
              {approved.agentCode} is active. This applicant already had an account, their existing
              password still works.
            </p>
          )}
          <Button variant="outline" size="sm" onClick={() => setApproved(null)}>
            Dismiss
          </Button>
        </div>
      ) : null}

      <FilterBar
        value={filters}
        onChange={setFilters}
        searchLabel="Search agent applications"
        searchPlaceholder="Name, mobile, or RERA code"
        statusOptions={STATUS_OPTIONS}
        lineOptions={[
          { value: "loans", label: "Loans" },
          { value: "real_estate", label: "Real Estate" },
        ]}
        dateFromLabel="Applied from"
        dateToLabel="Applied to"
      />

      {loading ? (
        <ListLoadingState />
      ) : error ? (
        <FetchError status={null} message={error} onRetry={() => void reload()} />
      ) : total === 0 ? (
        <ListEmptyState
          icon={Inbox}
          title={
            filtersAreActive(filters)
              ? "No applications match these filters"
              : "No applications awaiting review"
          }
          description={
            filtersAreActive(filters)
              ? "Try a different search, status, line, or application date."
              : "New agent applications will show up here for approval."
          }
        />
      ) : (
        <DashboardPanel
          title="Applications"
          description={
            filtersAreActive(filters)
              ? `${total} of ${items.length} applications`
              : `${items.length} applications`
          }
          bodyClassName="p-0"
        >
          <DataTable
            columns={columns}
            rows={pageRows}
            rowKey={(application) => application.id}
            sort={sort}
            onSortChange={(key) => setSort((current) => nextSort(current, key))}
            onRowClick={openApplication}
            rowActionLabel="Open application"
            minWidth="min-w-[860px]"
          />
          <div className="px-5 pb-4">
            <ListPagination page={page} total={total} onPageChange={setPage} />
          </div>
        </DashboardPanel>
      )}

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActiveId(null)}>
        <DialogContent showCloseButton={false} className={WORKSPACE_DIALOG_CLASS}>
          {active ? (
            <>
              <WorkspaceDialogHeader
                title={`${active.first_name ?? ""} ${active.last_name ?? ""}`.trim() || "Applicant"}
                description={`${active.mobile ? formatMobile(active.mobile) : "No mobile"} · applied ${formatDate(active.created_at)}`}
                closeLabel="Close application"
                actions={
                  <StatusBadge tone={STATUS_TONE[active.status] ?? "neutral"}>
                    {STATUS_LABEL[active.status] ?? active.status}
                  </StatusBadge>
                }
              />

              <WorkspaceLayout
                editor={
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-text-primary">KYC documents</p>
                    {detailLoading ? (
                      <div className="flex items-center justify-center py-10">
                        <Loader2
                          className="h-5 w-5 animate-spin text-brand-cta"
                          aria-hidden="true"
                        />
                      </div>
                    ) : detailError ? (
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                        <span className="flex items-center gap-2 text-text-secondary">
                          <FileWarning className="h-4 w-4" aria-hidden="true" />
                          {detailError}
                        </span>
                        <Button variant="outline" size="sm" onClick={() => void reloadDetail()}>
                          Retry
                        </Button>
                      </div>
                    ) : !detail || detail.documents.length === 0 ? (
                      <p className="text-sm text-text-secondary">
                        No documents on this application.
                      </p>
                    ) : (
                      <>
                        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                          {detail.documents.map((document) => (
                            <DocumentTile key={document.doc_type} document={document} />
                          ))}
                        </ul>
                        <p className="text-xs text-text-secondary">
                          Links expire in a few minutes.
                        </p>
                      </>
                    )}
                  </div>
                }
                preview={
                  <div className="space-y-4">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border p-4 text-sm">
                      <div>
                        <dt className="text-text-secondary">Business line</dt>
                        <dd className="font-medium text-text-primary">
                          {active.business_line === "loans" ? "Loans" : "Real Estate"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-text-secondary">RERA code</dt>
                        <dd className="font-medium text-text-primary">{active.rera_code ?? "-"}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-text-secondary">Email</dt>
                        <dd className="break-words font-medium text-text-primary">
                          {active.email ?? "-"}
                        </dd>
                      </div>
                    </dl>

                    {active.status !== "pending" ? (
                      <p className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-text-secondary">
                        This application has already been{" "}
                        {STATUS_LABEL[active.status]?.toLowerCase() ?? active.status}.
                      </p>
                    ) : (
                      <>
                        {rejecting ? (
                          <div className="rounded-xl border border-border p-4">
                            <Textarea
                              aria-label="Reason for rejection"
                              value={note}
                              onChange={(event) => {
                                setNote(event.target.value);
                                setNoteError(undefined);
                              }}
                              placeholder="Reason for rejection"
                              rows={3}
                              maxLength={1000}
                              aria-invalid={Boolean(noteError)}
                              aria-describedby={noteError ? "agent-rejection-note-error" : undefined}
                            />
                            <FieldError id="agent-rejection-note-error">{noteError}</FieldError>
                          </div>
                        ) : null}

                        <div className="flex flex-wrap justify-end gap-2">
                          {rejecting ? (
                            <>
                              <Button
                                variant="ghost"
                                onClick={() => setRejecting(false)}
                                disabled={busy}
                              >
                                Back
                              </Button>
                              <Button
                                variant="destructive"
                                onClick={() => void onReject(active)}
                                disabled={busy}
                              >
                                {busy ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <XCircle className="h-4 w-4" />
                                )}
                                Confirm reject
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                onClick={() => setRejecting(true)}
                                disabled={busy}
                              >
                                Reject
                              </Button>
                              <Button onClick={() => void onApprove(active)} disabled={busy}>
                                {busy ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4" />
                                )}
                                Approve
                              </Button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                }
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </DashboardPage>
  );
}
