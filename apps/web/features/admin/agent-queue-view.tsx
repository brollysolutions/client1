"use client";

import * as React from "react";
import { CheckCircle2, Download, FileWarning, Inbox, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { requiredTextError } from "@/lib/form-validation";
import {
  approveAgentApplication,
  rejectAgentApplication,
  type AgentApplication,
  type AgentApplicationDocument,
} from "@/lib/admin-api";
import { TempCredentialPanel } from "./temp-credential-panel";
import { useAgentApplicationDetail } from "./use-agent-application-detail";
import { useAgentQueue } from "./use-agent-queue";
import { AdminPagination, ADMIN_PAGE_SIZE, isInDateRange } from "./admin-list-tools";

const DOC_LABELS: Record<AgentApplicationDocument["doc_type"], string> = {
  aadhaar_front: "Aadhaar (front)",
  aadhaar_back: "Aadhaar (back)",
  pan: "PAN card",
  photo: "Photo",
};

export function AgentQueueView() {
  const { items, loading, error, reload } = useAgentQueue();
  const [line, setLine] = React.useState("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(0);
  const filtered = React.useMemo(() => items.filter((app) => (
    (line === "all" || app.business_line === line) &&
    isInDateRange(app.created_at, dateFrom, dateTo) &&
    `${app.first_name ?? ""} ${app.last_name ?? ""} ${app.rera_code ?? ""}`.toLowerCase().includes(search.toLowerCase())
  )), [dateFrom, dateTo, items, line, search]);
  React.useEffect(() => setPage(0), [dateFrom, dateTo, line, search]);
  const pageItems = filtered.slice(page * ADMIN_PAGE_SIZE, (page + 1) * ADMIN_PAGE_SIZE);
  const [active, setActive] = React.useState<AgentApplication | null>(null);
  const {
    detail,
    loading: detailLoading,
    error: detailError,
    reload: reloadDetail,
  } = useAgentApplicationDetail(active?.id ?? null);
  const [rejecting, setRejecting] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [noteError, setNoteError] = React.useState<string>();
  const [busy, setBusy] = React.useState(false);
  const [approved, setApproved] = React.useState<{
    mobile: string;
    agentCode: string;
    tempPassword: string | null;
  } | null>(null);

  async function onApprove(app: AgentApplication) {
    setBusy(true);
    const res = await approveAgentApplication(app.id);
    setBusy(false);
    if (res.ok) {
      toast.success("Agent approved", { description: `${res.data.agent_code} is now active.` });
      setApproved({
        mobile: app.mobile ?? "the applicant",
        agentCode: res.data.agent_code,
        tempPassword: res.data.temp_password,
      });
      setActive(null);
      void reload();
    } else {
      toast.error("Could not approve", { description: res.error });
    }
  }

  async function onReject(app: AgentApplication) {
    const error = requiredTextError(note, "Rejection reason", 1000);
    setNoteError(error);
    if (error) return;
    setBusy(true);
    const res = await rejectAgentApplication(app.id, note.trim());
    setBusy(false);
    if (res.ok) {
      toast.success("Application rejected");
      setActive(null);
      setRejecting(false);
      setNote("");
      setNoteError(undefined);
      void reload();
    } else {
      toast.error("Could not reject", { description: res.error });
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Agent applications</h1>
        <p className="text-sm text-text-secondary">
          Approve a pending application into a live agent account, or reject it with a reason.
        </p>
      </div>
      <div className="grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input aria-label="Search agent applications" placeholder="Name or RERA code" value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)} />
        <Select value={line} onValueChange={setLine}><SelectTrigger aria-label="Filter agent applications by line"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All lines</SelectItem><SelectItem value="loans">Loans</SelectItem><SelectItem value="real_estate">Real Estate</SelectItem></SelectContent></Select>
        <Input aria-label="Agent applications from date" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        <Input aria-label="Agent applications to date" type="date" min={dateFrom || undefined} value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
      </div>

      {approved ? (
        <div className="space-y-3">
          {approved.tempPassword ? (
            <TempCredentialPanel mobile={approved.mobile} tempPassword={approved.tempPassword} />
          ) : (
            <p className="rounded-xl border border-border bg-card p-4 text-sm text-text-secondary">
              {approved.agentCode} is active. This applicant already had an account, their
              existing password still works.
            </p>
          )}
          <Button variant="outline" size="sm" onClick={() => setApproved(null)}>
            Dismiss
          </Button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border bg-card py-16">
          <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-text-secondary">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
          <Inbox className="h-8 w-8 text-text-secondary" aria-hidden="true" />
          <p className="mt-3 font-medium text-text-primary">No applications awaiting review</p>
          <p className="mt-1 text-sm text-text-secondary">
            New agent applications will show up here for approval.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {pageItems.map((app) => (
            <li key={app.id}>
              <button
                type="button"
                onClick={() => {
                  setActive(app);
                   setRejecting(false);
                   setNote("");
                   setNoteError(undefined);
                }}
                className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-brand-cta"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-primary">
                    {app.first_name} {app.last_name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-text-secondary">{app.mobile}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {app.rera_code ? (
                    <span className="text-xs text-text-secondary">{app.rera_code}</span>
                  ) : null}
                  <Badge variant="secondary">Pending</Badge>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!loading && !error && filtered.length > 0 ? <AdminPagination page={page} total={filtered.length} onPageChange={setPage} /> : null}

      <Dialog open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-lg">
          {active ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {active.first_name} {active.last_name}
                </DialogTitle>
                <DialogDescription>{active.mobile}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-text-secondary">Business line</dt>
                    <dd className="font-medium text-text-primary">
                      {active.business_line === "loans" ? "Loans" : "Real Estate"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-secondary">RERA code</dt>
                    <dd className="font-medium text-text-primary">{active.rera_code ?? "—"}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-text-secondary">Email</dt>
                    <dd className="font-medium text-text-primary">{active.email ?? "—"}</dd>
                  </div>
                </dl>

                <div className="space-y-2 border-t border-border pt-4">
                  <p className="text-sm font-medium text-text-primary">KYC documents</p>
                  {detailLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-brand-navy" aria-hidden="true" />
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
                      <ul className="grid grid-cols-2 gap-2">
                        {detail.documents.map((doc) => (
                          <li key={doc.doc_type}>
                            <a
                              href={doc.download_url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-brand-navy transition-colors hover:border-brand-cta hover:text-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cta"
                            >
                              <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                              <span className="truncate">{DOC_LABELS[doc.doc_type]}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-text-secondary">
                        Links expire in a few minutes.
                      </p>
                    </>
                  )}
                </div>

                {rejecting ? (
                  <div>
                    <Textarea
                      aria-label="Reason for rejection"
                      value={note}
                      onChange={(e) => {
                        setNote(e.target.value);
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
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                {rejecting ? (
                  <>
                    <Button variant="ghost" onClick={() => setRejecting(false)} disabled={busy}>
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
                    <Button variant="outline" onClick={() => setRejecting(true)} disabled={busy}>
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
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
