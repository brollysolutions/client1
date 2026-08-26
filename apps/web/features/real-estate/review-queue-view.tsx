"use client";

import * as React from "react";
import Image from "next/image";
import { CheckCircle2, FileText, ImageOff, Inbox, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
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
import { Textarea } from "@/components/ui/textarea";
import { optionalTextError, requiredTextError } from "@/lib/form-validation";
import { formatPaiseCompact } from "@/lib/format";
import {
  approveSubmission,
  accessSubmissionMedia,
  getSubmission,
  rejectSubmission,
  reviewSubmissionRera,
  type Submission,
} from "@/lib/property-submissions-api";
import { useSubmissionQueue } from "./use-submission-queue";
import { ListingLifecyclePanel } from "./listing-lifecycle-panel";
import { AdminPagination, ADMIN_PAGE_SIZE, isInDateRange } from "../admin/admin-list-tools";

export function ReviewQueueView() {
  const { items, loading, error, reload } = useSubmissionQueue();
  const [search, setSearch] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [page, setPage] = React.useState(0);
  const filtered = React.useMemo(() => items.filter((submission) => (
    isInDateRange(submission.created_at, dateFrom, dateTo) &&
    `${submission.title} ${submission.location}`.toLowerCase().includes(search.toLowerCase())
  )), [dateFrom, dateTo, items, search]);
  React.useEffect(() => setPage(0), [dateFrom, dateTo, search]);
  const pageItems = filtered.slice(page * ADMIN_PAGE_SIZE, (page + 1) * ADMIN_PAGE_SIZE);
  const [active, setActive] = React.useState<Submission | null>(null);
  const [rejecting, setRejecting] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [reraNote, setReraNote] = React.useState("");
  const [noteError, setNoteError] = React.useState<string>();
  const [reraNoteError, setReraNoteError] = React.useState<string>();
  const [busy, setBusy] = React.useState(false);
  const [mediaUrls, setMediaUrls] = React.useState<Record<string, string>>({});
  const [mediaLoading, setMediaLoading] = React.useState(false);
  const activeMedia = React.useMemo(() => active?.media ?? [], [active]);
  const activeId = active?.id;
  const waitingForMedia = activeMedia.some((asset) =>
    ["pending", "processing"].includes(asset.processing_status),
  );
  const reraReady = Boolean(
    active &&
      ((active.rera_applicability === "applicable" && active.rera_verification_status === "verified") ||
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

  async function onApprove(sub: Submission) {
    setBusy(true);
    const res = await approveSubmission(sub.id);
    setBusy(false);
    if (res.ok) {
      toast.success("Listing approved", { description: `${sub.title} is now live in the catalog.` });
      setActive(null);
      void reload();
    } else {
      toast.error("Could not approve", { description: res.error });
    }
  }

  async function onReject(sub: Submission) {
    const validationError = requiredTextError(note, "Rejection reason", 1000);
    setNoteError(validationError);
    if (validationError) return;
    setBusy(true);
    const res = await rejectSubmission(sub.id, note.trim());
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

  async function onReraReview(
    sub: Submission,
    status: "verified" | "mismatch" | "exemption_verified",
  ) {
    const validationError = status === "verified"
      ? optionalTextError(reraNote, "RERA review note", 1000)
      : requiredTextError(reraNote, "RERA review note", 1000);
    setReraNoteError(validationError);
    if (validationError) return;
    setBusy(true);
    const result = await reviewSubmissionRera(sub.id, {
      status,
      note: reraNote.trim() || null,
    });
    setBusy(false);
    if (result.ok) {
      setActive(result.data);
      setReraNote("");
      toast.success("RERA review saved");
      void reload();
    } else {
      toast.error("Could not save RERA review", { description: result.error });
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Property review</h1>
        <p className="text-sm text-text-secondary">
          Review Agent, Admin, and Sub Admin listings before publishing them to the catalog.
        </p>
      </div>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Published listings</h2>
          <p className="text-sm text-text-secondary">Publish or hide an approved listing without changing its reviewed facts or media.</p>
        </div>
        <ListingLifecyclePanel />
      </section>

      <div className="grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-3">
        <Input aria-label="Search property approvals" placeholder="Listing or location" value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)} />
        <Input aria-label="Property approvals from date" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        <Input aria-label="Property approvals to date" type="date" min={dateFrom || undefined} value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
      </div>

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
          <p className="mt-3 font-medium text-text-primary">No submissions awaiting review</p>
          <p className="mt-1 text-sm text-text-secondary">
            New property listings will show up here for approval.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {pageItems.map((sub) => (
            <li key={sub.id}>
              <button
                type="button"
                onClick={() => {
                  setActive(sub);
                  setRejecting(false);
                  setNote("");
                  setReraNote("");
                  setNoteError(undefined);
                  setReraNoteError(undefined);
                }}
                className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-brand-cta"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-primary">{sub.title}</p>
                  <p className="mt-0.5 truncate text-xs text-text-secondary">{sub.location}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold text-text-primary">
                    {formatPaiseCompact(sub.price_paise)}
                  </span>
                  <Badge variant="secondary">Pending</Badge>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!loading && !error && filtered.length > 0 ? <AdminPagination page={page} total={filtered.length} onPageChange={setPage} /> : null}

      <Dialog open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto overscroll-contain">
          {active ? (
            <>
              <DialogHeader>
                <DialogTitle>{active.title}</DialogTitle>
                <DialogDescription>{active.location}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {mediaLoading ? (
                  <div className="flex h-44 items-center justify-center rounded-xl bg-muted">
                    <Loader2 className="h-5 w-5 animate-spin text-text-secondary" aria-hidden />
                  </div>
                ) : activeMedia.some((asset) => asset.kind === "image") ? (
                  <ul className="grid grid-cols-2 gap-2">
                    {activeMedia.filter((asset) => asset.kind === "image").map((asset, index) => (
                      <li key={asset.id} className="relative aspect-video overflow-hidden rounded-xl bg-muted">
                        {mediaUrls[asset.id] ? (
                          <Image src={mediaUrls[asset.id]} alt={`${active.title}, image ${index + 1}`} fill unoptimized className="object-cover" />
                        ) : (
                          <ImageOff className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-text-secondary" aria-hidden />
                        )}
                      </li>
                    ))}
                  </ul>
                ) : active.image?.startsWith("/") ? (
                  <div className="relative h-44 w-full overflow-hidden rounded-xl">
                    <Image src={active.image} alt={active.title} fill className="object-cover" />
                  </div>
                ) : (
                  <div className="flex h-44 w-full items-center justify-center rounded-xl bg-muted">
                    <ImageOff className="h-6 w-6 text-text-secondary" aria-hidden="true" />
                  </div>
                )}

                {activeMedia.some((asset) => asset.kind === "panorama") ? (
                  <div>
                    <p className="mb-2 text-sm font-medium text-text-primary">360° panorama</p>
                    {activeMedia.filter((asset) => asset.kind === "panorama").map((asset) => (
                      <div key={asset.id} className="rounded-xl border border-border bg-muted p-2">
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
                    <p className="mb-2 text-sm font-medium text-text-primary">Reviewer documents</p>
                    <ul className="space-y-2">
                      {activeMedia.filter((asset) => asset.kind === "document").map((asset, index) => (
                        <li key={asset.id}>
                          {mediaUrls[asset.id] ? (
                            <a href={mediaUrls[asset.id]} className="flex items-center gap-2 rounded-lg border p-2 text-sm text-brand-blue hover:underline" target="_blank" rel="noreferrer">
                              <FileText className="h-4 w-4" aria-hidden />
                              Download document {index + 1}
                            </a>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-text-secondary">Price</dt>
                    <dd className="font-medium text-text-primary">{formatPaiseCompact(active.price_paise)}</dd>
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
                    <dt className="text-text-secondary">RERA</dt>
                    <dd className="font-medium text-text-primary">{active.rera_number ?? "Not provided"}</dd>
                  </div>
                </dl>

                <div className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-text-primary">RERA registry review</p>
                      <p className="text-xs text-text-secondary">
                        Applicant selection: {active.rera_applicability.replaceAll("_", " ")}
                      </p>
                    </div>
                    <Badge variant={reraReady ? "default" : "secondary"}>
                      {active.rera_verification_status.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  <Label htmlFor="rera-review-note" className="mt-3 block">
                    Registry finding or exemption basis
                  </Label>
                  <Textarea
                    id="rera-review-note"
                    name="rera-review-note"
                    className="mt-1"
                    value={reraNote}
                    onChange={(event) => { setReraNote(event.target.value); setReraNoteError(undefined); }}
                    placeholder="Record the registry result for the audit trail"
                    rows={2}
                    maxLength={1000}
                    aria-invalid={Boolean(reraNoteError)}
                    aria-describedby={reraNoteError ? "rera-review-note-error" : undefined}
                  />
                  <FieldError id="rera-review-note-error">{reraNoteError}</FieldError>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {active.rera_applicability === "applicable" ? (
                      <Button type="button" size="sm" variant="outline" disabled={busy || !active.rera_number} onClick={() => void onReraReview(active, "verified")}>
                        Verify registration
                      </Button>
                    ) : null}
                    {active.rera_applicability === "exemption_claimed" ? (
                      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void onReraReview(active, "exemption_verified")}>
                        Confirm exemption
                      </Button>
                    ) : null}
                    <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => void onReraReview(active, "mismatch")}>
                      Mark mismatch
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-border p-4">
                  <p className="mb-3 text-sm font-medium text-text-primary">Subtype-specific details</p>
                  <PropertyDetailsSummary details={active.structured_details} />
                </div>

                {rejecting ? (
                  <div>
                    <Label htmlFor="property-rejection-reason">
                      Reason for rejection <RequiredIndicator />
                    </Label>
                    <Textarea
                      id="property-rejection-reason"
                      name="property-rejection-reason"
                      className="mt-1"
                      value={note}
                      onChange={(e) => { setNote(e.target.value); setNoteError(undefined); }}
                      placeholder="Explain what the submitter needs to correct"
                      rows={3}
                      maxLength={1000}
                      aria-invalid={Boolean(noteError)}
                      aria-describedby={noteError ? "property-rejection-reason-error" : "property-rejection-reason-help"}
                    />
                    <FieldError id="property-rejection-reason-error">{noteError}</FieldError>
                    <p id="property-rejection-reason-help" className="mt-1 text-xs text-text-secondary">
                      This reason is shown to the submitter.
                    </p>
                  </div>
                ) : null}
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                {rejecting ? (
                  <>
                    <Button variant="ghost" onClick={() => setRejecting(false)} disabled={busy}>
                      Back
                    </Button>
                    <Button variant="destructive" onClick={() => void onReject(active)} disabled={busy}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      Confirm reject
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setRejecting(true)} disabled={busy}>
                      Reject
                    </Button>
                    <Button
                      onClick={() => void onApprove(active)}
                      disabled={busy || !reraReady || activeMedia.some((asset) => asset.processing_status !== "ready")}
                      title={!reraReady ? "Complete the RERA review first" : activeMedia.some((asset) => asset.processing_status !== "ready") ? "Wait for all media processing to finish" : undefined}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
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
