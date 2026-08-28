"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FileText,
  ImageOff,
  Inbox,
  Loader2,
  PencilLine,
  Trash2,
  Undo2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import { PanoramaViewer } from "@/components/panorama-viewer";
import { PropertyDetailsSummary } from "@/components/property-details-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { StatusBadge } from "@/features/dashboard/status-badge";
import { useFilteredPage } from "@/features/dashboard/use-filtered-page";
import {
  WORKSPACE_DIALOG_CLASS,
  WorkspaceDialogHeader,
  WorkspaceLayout,
} from "@/features/dashboard/workspace-dialog";
import { PublishedListingsPanel } from "@/features/real-estate/published-listings-panel";
import { useSubmissionQueue } from "@/features/real-estate/use-submission-queue";
import { isInDateRange } from "@/lib/date-range";
import { formatAge, formatDate, formatPaiseCompact } from "@/lib/format";
import { optionalTextError, requiredTextError } from "@/lib/form-validation";
import {
  approveSubmission,
  accessSubmissionMedia,
  getSubmission,
  rejectSubmission,
  reviewSubmissionRera,
  withdrawSubmission,
  type Submission,
} from "@/lib/property-submissions-api";

/**
 * The listing approval queue (route `/dashboard/property-review`).
 *
 * Lives here rather than under `features/real-estate/` because it is an Admin
 * console. The submitting half of the same lifecycle stays in
 * `features/real-estate/`.
 *
 * The review itself is the richest in the codebase: a media grid with
 * per-asset presigned URLs, a 360 panorama viewer, reviewer documents, the RERA
 * registry sub-review, and subtype detail. It is rendered in the full-screen
 * workspace dialog so the media and the decision controls sit side by side
 * instead of stacked in a `max-w-3xl` column.
 */
export function ListingApprovalsView() {
  const router = useRouter();
  const { items, loading, error, reload } = useSubmissionQueue();

  const [tab, setTab] = React.useState("pending");
  const [filters, setFilters] = React.useState<FilterBarValue>(EMPTY_FILTERS);
  const [sort, setSort] = React.useState<SortState>({ key: "created_at", dir: "asc" });
  const [active, setActive] = React.useState<Submission | null>(null);
  const [rejecting, setRejecting] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Submission | null>(null);
  const [note, setNote] = React.useState("");
  const [reraNote, setReraNote] = React.useState("");
  const [noteError, setNoteError] = React.useState<string>();
  const [reraNoteError, setReraNoteError] = React.useState<string>();
  const [busy, setBusy] = React.useState(false);
  const [mediaUrls, setMediaUrls] = React.useState<Record<string, string>>({});
  const [mediaLoading, setMediaLoading] = React.useState(false);

  const filtered = React.useMemo(() => {
    const rows = items.filter(
      (submission) =>
        isInDateRange(submission.created_at, filters.from, filters.to) &&
        matchesSearch(`${submission.title} ${submission.location}`, filters.search),
    );
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sort.key) {
        case "title":
          return a.title.localeCompare(b.title) * direction;
        case "price_paise":
          return (a.price_paise - b.price_paise) * direction;
        default:
          return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * direction;
      }
    });
  }, [filters, items, sort]);

  const { page, setPage, pageRows, total } = useFilteredPage(filtered, filters);

  const activeMedia = React.useMemo(() => active?.media ?? [], [active]);
  const activeId = active?.id;
  const waitingForMedia = activeMedia.some((asset) =>
    ["pending", "processing"].includes(asset.processing_status),
  );
  const mediaReady = activeMedia.every((asset) => asset.processing_status === "ready");
  const reraReady = Boolean(
    active &&
      ((active.rera_applicability === "applicable" &&
        active.rera_verification_status === "verified") ||
        (active.rera_applicability === "exemption_claimed" &&
          active.rera_verification_status === "exemption_verified")),
  );

  React.useEffect(() => {
    if (!activeId || !waitingForMedia) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const result = await getSubmission(activeId);
      if (cancelled) return;
      if (result.ok) setActive(result.data);
      timer = setTimeout(() => void poll(), 5_000);
    };
    timer = setTimeout(() => void poll(), 5_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeId, waitingForMedia]);

  React.useEffect(() => {
    let cancelled = false;
    if (!active || activeMedia.length === 0) {
      setMediaUrls({});
      setMediaLoading(false);
      return;
    }
    setMediaLoading(true);
    void Promise.all(
      activeMedia.map(async (asset) => {
        const result = await accessSubmissionMedia(active.id, asset.id);
        return [asset.id, result.ok ? result.data.url : ""] as const;
      }),
    ).then((entries) => {
      if (!cancelled) {
        setMediaUrls(Object.fromEntries(entries.filter(([, url]) => url !== "")));
        setMediaLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [active, activeMedia]);

  function openSubmission(submission: Submission) {
    setActive(submission);
    setRejecting(false);
    setNote("");
    setReraNote("");
    setNoteError(undefined);
    setReraNoteError(undefined);
  }

  async function onApprove(submission: Submission) {
    setBusy(true);
    const res = await approveSubmission(submission.id);
    setBusy(false);
    if (res.ok) {
      toast.success("Listing approved", {
        description: `${submission.title} is now live in the catalog.`,
      });
      setActive(null);
      void reload();
    } else {
      toast.error("Could not approve", { description: res.error });
    }
  }

  async function onReject(submission: Submission) {
    const validationError = requiredTextError(note, "Rejection reason", 1000);
    setNoteError(validationError);
    if (validationError) return;
    setBusy(true);
    const res = await rejectSubmission(submission.id, note.trim());
    setBusy(false);
    if (res.ok) {
      toast.success("Submission rejected");
      setActive(null);
      setRejecting(false);
      setNote("");
      void reload();
    } else {
      toast.error("Could not reject", { description: res.error });
    }
  }

  async function onDelete(submission: Submission) {
    setBusy(true);
    const result = await withdrawSubmission(submission.id);
    setBusy(false);
    if (!result.ok) {
      toast.error("Could not delete listing", { description: result.error });
      return;
    }
    setDeleting(null);
    setActive(null);
    toast.success("Listing deleted", { description: "It has been withdrawn from the queue." });
    void reload();
  }

  async function onReraReview(
    submission: Submission,
    status: "verified" | "mismatch" | "exemption_verified" | "not_reviewed",
  ) {
    // Every outcome but a plain verification has to say why — withdrawing an
    // earlier verification most of all, since it un-does a published claim.
    const validationError =
      status === "verified"
        ? optionalTextError(reraNote, "RERA review note", 1000)
        : requiredTextError(reraNote, "RERA review note", 1000);
    setReraNoteError(validationError);
    if (validationError) return;
    setBusy(true);
    const result = await reviewSubmissionRera(submission.id, {
      status,
      note: reraNote.trim() || null,
    });
    setBusy(false);
    if (result.ok) {
      setActive(result.data);
      setReraNote("");
      toast.success(
        status === "not_reviewed" ? "RERA verification withdrawn" : "RERA review saved",
      );
      void reload();
    } else {
      toast.error("Could not save RERA review", { description: result.error });
    }
  }

  const columns: DataColumn<Submission>[] = [
    {
      key: "title",
      header: "Listing",
      sortable: true,
      cellClassName: "max-w-[24rem]",
      render: (submission) => (
        <DataTablePrimaryCell title={submission.title} subtitle={submission.location} />
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (submission) => (
        <span className="text-text-secondary">
          {submission.bhk > 0 ? `${submission.bhk} BHK · ` : ""}
          {submission.type}
        </span>
      ),
    },
    {
      key: "price_paise",
      header: "Price",
      sortable: true,
      align: "right",
      render: (submission) => (
        <span className="tabular-nums font-medium text-text-primary">
          {formatPaiseCompact(submission.price_paise)}
        </span>
      ),
    },
    {
      key: "rera_verification_status",
      header: "RERA",
      render: (submission) => {
        const settled =
          submission.rera_verification_status === "verified" ||
          submission.rera_verification_status === "exemption_verified";
        return (
          <StatusBadge
            tone={
              submission.rera_verification_status === "mismatch"
                ? "danger"
                : settled
                  ? "success"
                  : "warning"
            }
          >
            {submission.rera_verification_status.replaceAll("_", " ")}
          </StatusBadge>
        );
      },
    },
    {
      key: "created_at",
      header: "Waiting",
      sortable: true,
      align: "right",
      render: (submission) => (
        <span className="tabular-nums text-text-secondary" title={formatDate(submission.created_at)}>
          {formatAge(submission.created_at)}
        </span>
      ),
    },
  ];

  const approveBlockedReason = !reraReady
    ? "Complete the RERA review first"
    : !mediaReady
      ? "Wait for all media processing to finish"
      : undefined;

  return (
    <DashboardPage>
      <DashboardHeader
        title="Listing approvals"
        description="Review Agent, Admin, and Sub Admin listings before publishing them to the catalog."
      />

      <Tabs value={tab} onValueChange={setTab} className="gap-5">
        <TabsList>
          <TabsTrigger value="pending">Awaiting review</TabsTrigger>
          <TabsTrigger value="published">Published</TabsTrigger>
        </TabsList>

        <TabsContent value="published" className="space-y-5">
          <PublishedListingsPanel onChanged={() => void reload()} />
        </TabsContent>

        <TabsContent value="pending" className="space-y-5">
      <FilterBar
        value={filters}
        onChange={setFilters}
        searchLabel="Search listing approvals"
        searchPlaceholder="Listing or location"
        showStatus={false}
        showLine={false}
        dateFromLabel="Submitted from"
        dateToLabel="Submitted to"
        note="Every listing here is awaiting a decision. Open one to review, edit, or delete it."
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
              ? "No submissions match these filters"
              : "No submissions awaiting review"
          }
          description={
            filtersAreActive(filters)
              ? "Try a different search or submission date range."
              : "New property listings will show up here for approval."
          }
        />
      ) : (
        <DashboardPanel
          title="Awaiting review"
          description={
            filtersAreActive(filters)
              ? `${total} of ${items.length} submissions`
              : `${items.length} submissions`
          }
          bodyClassName="p-0"
        >
          <DataTable
            columns={columns}
            rows={pageRows}
            rowKey={(submission) => submission.id}
            sort={sort}
            onSortChange={(key) => setSort((current) => nextSort(current, key))}
            onRowClick={openSubmission}
            rowActionLabel="Review listing"
            minWidth="min-w-[880px]"
          />
          <div className="px-5 pb-4">
            <ListPagination page={page} total={total} onPageChange={setPage} />
          </div>
        </DashboardPanel>
      )}

        </TabsContent>
      </Tabs>

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent showCloseButton={false} className={WORKSPACE_DIALOG_CLASS}>
          {active ? (
            <>
              <WorkspaceDialogHeader
                title={active.title}
                description={`${active.location} · ${formatPaiseCompact(active.price_paise)}`}
                closeLabel="Close listing review"
                actions={
                  <StatusBadge tone={reraReady && mediaReady ? "success" : "warning"}>
                    {reraReady && mediaReady ? "Ready to decide" : "Blocked"}
                  </StatusBadge>
                }
              />

              <WorkspaceLayout
                editor={
                  <div className="space-y-4">
                    {mediaLoading ? (
                      <div className="flex h-56 items-center justify-center rounded-xl bg-muted">
                        <Loader2 className="h-5 w-5 animate-spin text-text-secondary" aria-hidden />
                      </div>
                    ) : activeMedia.some((asset) => asset.kind === "image") ? (
                      <ul className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                        {activeMedia
                          .filter((asset) => asset.kind === "image")
                          .map((asset, index) => (
                            <li
                              key={asset.id}
                              className="relative aspect-video overflow-hidden rounded-xl bg-muted"
                            >
                              {mediaUrls[asset.id] ? (
                                <Image
                                  src={mediaUrls[asset.id]}
                                  alt={`${active.title}, image ${index + 1}`}
                                  fill
                                  unoptimized
                                  className="object-cover"
                                />
                              ) : (
                                <ImageOff
                                  className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-text-secondary"
                                  aria-hidden
                                />
                              )}
                            </li>
                          ))}
                      </ul>
                    ) : active.image?.startsWith("/") ? (
                      <div className="relative h-56 w-full overflow-hidden rounded-xl">
                        <Image src={active.image} alt={active.title} fill className="object-cover" />
                      </div>
                    ) : (
                      <div className="flex h-56 w-full items-center justify-center rounded-xl bg-muted">
                        <ImageOff className="h-6 w-6 text-text-secondary" aria-hidden="true" />
                      </div>
                    )}

                    {activeMedia.some((asset) => asset.kind === "panorama") ? (
                      <div>
                        <p className="mb-2 text-sm font-medium text-text-primary">360° panorama</p>
                        {activeMedia
                          .filter((asset) => asset.kind === "panorama")
                          .map((asset) => (
                            <div
                              key={asset.id}
                              className="rounded-xl border border-border bg-muted p-2"
                            >
                              {mediaUrls[asset.id] && asset.processing_status === "ready" ? (
                                <PanoramaViewer src={mediaUrls[asset.id]} title={active.title} />
                              ) : (
                                <div className="flex aspect-video items-center justify-center text-sm text-text-secondary">
                                  Panorama unavailable
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    ) : null}

                    {activeMedia.some((asset) => asset.kind === "document") ? (
                      <div>
                        <p className="mb-2 text-sm font-medium text-text-primary">
                          Reviewer documents
                        </p>
                        <ul className="space-y-2">
                          {activeMedia
                            .filter((asset) => asset.kind === "document")
                            .map((asset, index) =>
                              mediaUrls[asset.id] ? (
                                <li key={asset.id}>
                                  <a
                                    href={mediaUrls[asset.id]}
                                    className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm text-brand-cta hover:underline"
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <FileText className="h-4 w-4" aria-hidden />
                                    Download document {index + 1}
                                  </a>
                                </li>
                              ) : null,
                            )}
                        </ul>
                      </div>
                    ) : null}

                    <div className="rounded-xl border border-border p-4">
                      <p className="mb-3 text-sm font-medium text-text-primary">
                        Subtype-specific details
                      </p>
                      <PropertyDetailsSummary details={active.structured_details} />
                    </div>
                  </div>
                }
                preview={
                  <div className="space-y-4">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border p-4 text-sm">
                      <div>
                        <dt className="text-text-secondary">Price</dt>
                        <dd className="font-medium text-text-primary">
                          {formatPaiseCompact(active.price_paise)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-text-secondary">Type</dt>
                        <dd className="font-medium text-text-primary">{active.type}</dd>
                      </div>
                      <div>
                        <dt className="text-text-secondary">Config</dt>
                        <dd className="font-medium text-text-primary">
                          {active.bhk > 0 ? `${active.bhk} BHK · ` : ""}
                          {active.area_sqft} sqft
                        </dd>
                      </div>
                      <div>
                        <dt className="text-text-secondary">RERA number</dt>
                        <dd className="font-medium text-text-primary">
                          {active.rera_number ?? "Not provided"}
                        </dd>
                      </div>
                    </dl>

                    <div className="rounded-xl border border-border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-text-primary">
                            RERA registry review
                          </p>
                          <p className="text-xs text-text-secondary">
                            Applicant selection: {active.rera_applicability.replaceAll("_", " ")}
                          </p>
                        </div>
                        <StatusBadge tone={reraReady ? "success" : "warning"}>
                          {active.rera_verification_status.replaceAll("_", " ")}
                        </StatusBadge>
                      </div>
                      <Label htmlFor="rera-review-note" className="mt-3 block">
                        Registry finding or exemption basis
                      </Label>
                      <Textarea
                        id="rera-review-note"
                        name="rera-review-note"
                        className="mt-1"
                        value={reraNote}
                        onChange={(event) => {
                          setReraNote(event.target.value);
                          setReraNoteError(undefined);
                        }}
                        placeholder="Record the registry result for the audit trail"
                        rows={2}
                        maxLength={1000}
                        aria-invalid={Boolean(reraNoteError)}
                        aria-describedby={reraNoteError ? "rera-review-note-error" : undefined}
                      />
                      <FieldError id="rera-review-note-error">{reraNoteError}</FieldError>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {active.rera_applicability === "applicable" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy || !active.rera_number}
                            onClick={() => void onReraReview(active, "verified")}
                          >
                            Verify registration
                          </Button>
                        ) : null}
                        {active.rera_applicability === "exemption_claimed" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void onReraReview(active, "exemption_verified")}
                          >
                            Confirm exemption
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          onClick={() => void onReraReview(active, "mismatch")}
                        >
                          Mark mismatch
                        </Button>
                        {active.rera_verification_status !== "not_reviewed" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void onReraReview(active, "not_reviewed")}
                          >
                            <Undo2 className="h-4 w-4" aria-hidden="true" />
                            Unverify
                          </Button>
                        ) : null}
                      </div>
                      {active.rera_verification_status !== "not_reviewed" ? (
                        <p className="mt-2 text-xs text-text-secondary">
                          Unverifying returns this listing to an unreviewed RERA state and, if it
                          is already published, takes it off the public catalogue.
                        </p>
                      ) : null}
                    </div>

                    {rejecting ? (
                      <div className="rounded-xl border border-border p-4">
                        <Label htmlFor="property-rejection-reason">
                          Reason for rejection <RequiredIndicator />
                        </Label>
                        <Textarea
                          id="property-rejection-reason"
                          name="property-rejection-reason"
                          className="mt-1"
                          value={note}
                          onChange={(event) => {
                            setNote(event.target.value);
                            setNoteError(undefined);
                          }}
                          placeholder="Explain what the submitter needs to correct"
                          rows={3}
                          maxLength={1000}
                          aria-invalid={Boolean(noteError)}
                          aria-describedby={
                            noteError
                              ? "property-rejection-reason-error"
                              : "property-rejection-reason-help"
                          }
                        />
                        <FieldError id="property-rejection-reason-error">{noteError}</FieldError>
                        <p
                          id="property-rejection-reason-help"
                          className="mt-1 text-xs text-text-secondary"
                        >
                          This reason is shown to the submitter.
                        </p>
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
                            variant="ghost"
                            onClick={() => setDeleting(active)}
                            disabled={busy}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Delete
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() =>
                              router.push(`/dashboard/my-submissions/${active.id}/edit`)
                            }
                            disabled={busy}
                          >
                            <PencilLine className="h-4 w-4" aria-hidden="true" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setRejecting(true)}
                            disabled={busy}
                          >
                            Reject
                          </Button>
                          <Button
                            onClick={() => void onApprove(active)}
                            disabled={busy || Boolean(approveBlockedReason)}
                            title={approveBlockedReason}
                          >
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
                    {approveBlockedReason && !rejecting ? (
                      <p className="text-right text-xs text-text-secondary">
                        {approveBlockedReason}.
                      </p>
                    ) : null}
                  </div>
                }
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete {deleting?.title}?</DialogTitle>
            <DialogDescription>
              The submission is withdrawn and leaves this queue. Its record and audit history are
              retained, but it can no longer be reviewed, edited, or approved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleting && void onDelete(deleting)}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Delete listing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardPage>
  );
}
