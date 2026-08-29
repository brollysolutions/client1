"use client";
/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import Link from "next/link";
import {
  Archive,
  CalendarClock,
  Check,
  ImageIcon,
  Images,
  Inbox,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import { DashboardHeader, DashboardPage, DashboardPanel, MetricCard, MetricGrid } from "@/features/dashboard/dashboard-ui";
import { DataTable, DataTablePrimaryCell, type DataColumn } from "@/features/dashboard/data-table";
import { FetchError } from "@/features/dashboard/fetch-error";
import { EMPTY_FILTERS, FilterBar, type FilterBarValue } from "@/features/dashboard/filter-bar";
import { ListEmptyState, ListLoadingState, ListPagination } from "@/features/dashboard/list-states";
import { StatusBadge, type StatusTone } from "@/features/dashboard/status-badge";
import { useFilteredPage } from "@/features/dashboard/use-filtered-page";
import {
  activateOffer,
  approveOffer,
  archiveOffer,
  deleteOffer,
  rejectOffer,
  removeOffer,
  scheduleOffer,
  submitOffer,
  type Offer,
} from "@/lib/offers-api";

import { audienceSummary } from "./audience-rule-fields";
import { filterOffers } from "./cms-filters";
import { OfferPreview } from "./cms-previews";
import { CmsPreviewFrame, CmsWorkspaceHeader, CmsWorkspaceLayout, CMS_WORKSPACE_DIALOG_CLASS, type PreviewDevice } from "./cms-workspace";
import { OfferForm } from "./offer-form";
import { useOfferQueue } from "./use-offer-queue";

const STATUS_LABEL: Record<Offer["status"], string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  rejected: "Changes requested",
  scheduled: "Scheduled",
  active: "Live",
  expired: "Expired",
  archived: "Archived",
};
const STATUS_TONE: Record<Offer["status"], StatusTone> = {
  draft: "neutral",
  pending_approval: "warning",
  approved: "success",
  rejected: "danger",
  scheduled: "warning",
  active: "success",
  expired: "neutral",
  archived: "neutral",
};
const EDITABLE = new Set<Offer["status"]>(["draft", "rejected"]);
const KIND_OPTIONS = [
  { value: "percentage", label: "Percentage" },
  { value: "flat", label: "Flat amount" },
  { value: "cashback-tie", label: "Cashback" },
];

function discountText(offer: Offer): string {
  if (offer.discount_type === "percentage") return `${offer.discount_value}% off`;
  if (offer.discount_type === "cashback-tie") return "Cashback offer";
  return `₹${offer.discount_value} off`;
}

export function OffersView({
  embedded = false,
  initialStatus,
  onPendingCount,
}: {
  embedded?: boolean;
  /** Preselect a status so the approvals desk opens on actionable work. */
  initialStatus?: FilterBarValue["status"];
  /** Reports how many campaigns are awaiting review, for the tab badge. */
  onPendingCount?: (count: number) => void;
}) {
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";
  const { items, loading, error, reload } = useOfferQueue();
  const [filters, setFilters] = React.useState<FilterBarValue>(() =>
    initialStatus ? { ...EMPTY_FILTERS, status: initialStatus } : EMPTY_FILTERS,
  );
  const filtered = React.useMemo(() => filterOffers(items, filters), [filters, items]);
  const page = useFilteredPage(filtered, filters);
  const [active, setActive] = React.useState<Offer | null>(null);
  const [workspaceDirty, setWorkspaceDirty] = React.useState(false);
  const [reviewNote, setReviewNote] = React.useState("");
  const [reviewAction, setReviewAction] = React.useState<"changes" | "remove" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [device, setDevice] = React.useState<PreviewDevice>("desktop");
  const { confirm, confirmDialog } = useConfirm();
  const pendingCount = items.filter((item) => item.status === "pending_approval").length;
  React.useEffect(() => onPendingCount?.(pendingCount), [onPendingCount, pendingCount]);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createDirty, setCreateDirty] = React.useState(false);
  const canEdit = Boolean(active && !isAdmin && EDITABLE.has(active.status));

  const columns = React.useMemo<readonly DataColumn<Offer>[]>(() => [
    { key: "offer", header: "Campaign", render: (item) => <DataTablePrimaryCell title={item.title} subtitle={`${item.partner_name ?? "Partner not set"} · ${audienceSummary(item.audience_rules)}`} /> },
    { key: "discount", header: "Benefit", render: discountText },
    { key: "line", header: "Line", render: (item) => item.business_line === "both" ? "Both lines" : item.business_line === "real_estate" ? "Real Estate" : "Loans" },
    { key: "starts", header: "Start", render: (item) => item.starts_at ? new Date(item.starts_at).toLocaleDateString("en-IN") : "Manual" },
    { key: "state", header: "State", render: (item) => <StatusBadge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</StatusBadge> },
  ], []);

  function open(item: Offer) {
    setActive(item);
    setWorkspaceDirty(false);
    setReviewNote("");
    setReviewAction(null);
  }

  // `onOpenChange` is synchronous, so a dirty close cannot await the answer.
  // The workspace stays open and the confirmation opens above it.
  function closeWorkspace(nextOpen: boolean) {
    if (nextOpen || busy) return;
    if (!workspaceDirty) {
      setActive(null);
      setWorkspaceDirty(false);
      return;
    }
    void confirm({
      title: "Discard unsaved offer changes?",
      description: "Your edits to this campaign will be lost.",
      confirmLabel: "Discard changes",
      destructive: true,
    }).then((confirmed) => {
      if (!confirmed) return;
      setActive(null);
      setWorkspaceDirty(false);
    });
  }

  function closeCreate(nextOpen: boolean) {
    if (nextOpen) return setCreateOpen(true);
    if (!createDirty) {
      setCreateOpen(false);
      setCreateDirty(false);
      return;
    }
    void confirm({
      title: "Discard this offer draft?",
      description: "Nothing has been saved yet, so this draft will be lost.",
      confirmLabel: "Discard draft",
      destructive: true,
    }).then((confirmed) => {
      if (!confirmed) return;
      setCreateOpen(false);
      setCreateDirty(false);
    });
  }

  async function transition(
    action: (id: string) => ReturnType<typeof submitOffer>,
    item: Offer,
    message: string,
  ) {
    setBusy(true);
    const result = await action(item.id);
    setBusy(false);
    if (!result.ok) return void toast.error("Could not update offer", { description: result.error });
    toast.success(message);
    setActive(null);
    void reload();
  }

  async function reject(item: Offer) {
    if (!reviewNote.trim()) return void toast.error("Explain what needs to change");
    setBusy(true);
    const result = await rejectOffer(item.id, reviewNote.trim());
    setBusy(false);
    if (!result.ok) return void toast.error("Could not request changes", { description: result.error });
    toast.success("Changes requested");
    setActive(null);
    void reload();
  }

  async function removeReviewed(item: Offer) {
    if (!reviewNote.trim()) return void toast.error("Explain why this campaign must be removed");
    setBusy(true);
    const result = await removeOffer(item.id, reviewNote.trim());
    setBusy(false);
    if (!result.ok) return void toast.error("Could not remove offer", { description: result.error });
    toast.success("Offer removed from serving");
    setActive(null);
    void reload();
  }

  async function removeDraft(item: Offer) {
    const confirmed = await confirm({
      title: "Delete this draft?",
      description:
        "This campaign has never been submitted for review, so deleting it leaves no record. This cannot be undone.",
      confirmLabel: "Delete draft",
      destructive: true,
    });
    if (!confirmed) return;
    setBusy(true);
    const result = await deleteOffer(item.id);
    setBusy(false);
    if (!result.ok) return void toast.error("Could not delete draft", { description: result.error });
    toast.success("Draft deleted");
    setActive(null);
    void reload();
  }

  return (
    <DashboardPage>
      {confirmDialog}
      {/* See banners-view: the approvals desk already labels this queue. */}
      {embedded ? null : <DashboardHeader
        title={isAdmin ? "Offer approvals" : "Dashboard offers"}
        description={isAdmin ? "Approve complete partner coupon campaigns before they can reach a dashboard." : "Create role-targeted partner coupons, submit them for approval, then schedule or activate them."}
        actions={
          isAdmin ? undefined : (
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline">
                <Link href="/dashboard/media-library">
                  <Images className="h-4 w-4" aria-hidden />
                  Media library
                </Link>
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden />
                New offer
              </Button>
            </div>
          )
        }
      />}
      {!embedded ? <MetricGrid>
        <MetricCard label="Total campaigns" value={items.length} icon={DASHBOARD_ICONS.offers} />
        <MetricCard label="Pending review" value={items.filter((item) => item.status === "pending_approval").length} icon={DASHBOARD_ICONS.websiteContent} />
        <MetricCard label="Approved" value={items.filter((item) => item.status === "approved" || item.status === "scheduled").length} icon={CalendarClock} />
        <MetricCard label="Live" value={items.filter((item) => item.status === "active").length} icon={DASHBOARD_ICONS.analytics} />
      </MetricGrid> : null}
      <FilterBar value={filters} onChange={setFilters} searchLabel="Search offers" searchPlaceholder="Campaign, partner, description, or code" statusOptions={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))} statusLabel="offer states" kindLabel="discount types" kindOptions={KIND_OPTIONS} note={embedded ? undefined : "Coupon campaigns are dashboard-only and require explicit role targeting."} />
      {error ? <FetchError status={null} message={error} onRetry={() => void reload()} /> : (
        <DashboardPanel title={isAdmin ? "Campaign oversight" : "Campaign library"} description={`${filtered.length} ${filtered.length === 1 ? "campaign" : "campaigns"} shown.`} bodyClassName={embedded ? "p-4" : "p-0"}>
          {loading ? <div className="p-5"><ListLoadingState rows={5} /></div> : filtered.length === 0 ? <ListEmptyState icon={Inbox} title={items.length ? "No campaigns match these filters" : "No dashboard offers yet"} description={items.length ? "Clear or adjust the filters." : isAdmin ? "Submitted campaigns will appear here." : "Create the first partner coupon campaign."} className="m-5" /> : <>{embedded ? <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{page.pageRows.map((item) => <li key={item.id}><button type="button" onClick={() => open(item)} className="w-full overflow-hidden rounded-xl border border-border bg-background text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="relative aspect-[16/7] overflow-hidden bg-muted">{item.image_url ? <img src={item.image_url} alt="" width={960} height={420} className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-text-secondary"><ImageIcon className="h-7 w-7" /></span>}<span className="absolute left-3 top-3"><StatusBadge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</StatusBadge></span></div><div className="space-y-2 p-4"><div className="flex items-start justify-between gap-3"><p className="line-clamp-2 font-semibold text-text-primary">{item.title}</p><span className="shrink-0 text-xs font-semibold text-[var(--nav-primary)]">{discountText(item)}</span></div><p className="text-xs text-text-secondary">{item.partner_name ?? "Partner incomplete"} · {audienceSummary(item.audience_rules)}</p></div></button></li>)}</ul> : <DataTable columns={columns} rows={page.pageRows} rowKey={(item) => item.id} onRowClick={open} rowActionLabel="Open offer workspace" minWidth="min-w-[820px]" />}<div className="px-5 pb-5"><ListPagination page={page.page} total={page.total} onPageChange={page.setPage} /></div></>}
        </DashboardPanel>
      )}

      <Dialog open={active !== null} onOpenChange={closeWorkspace}>
        <DialogContent showCloseButton={false} className={CMS_WORKSPACE_DIALOG_CLASS}>
          {active && canEdit ? <>
            <CmsWorkspaceHeader title={active.title} description={`${STATUS_LABEL[active.status]} · Correct every requested field before resubmitting`} />
            <div className="min-h-0 overflow-y-auto py-2">
              <OfferForm
                embedded
                initialOffer={active}
                onDirtyChange={setWorkspaceDirty}
                onSaved={() => {
                  setWorkspaceDirty(false);
                  setActive(null);
                  void reload();
                }}
              />
              <DialogFooter className="px-6 pb-6">
                {active.status === "draft" ? <Button variant="destructive" disabled={busy} onClick={() => void removeDraft(active)}><Trash2 className="h-4 w-4" />Delete draft</Button> : null}
                <Button variant="outline" disabled={busy} onClick={() => void transition(archiveOffer, active, "Offer archived")}><Archive className="h-4 w-4" />Archive</Button>
                <Button disabled={busy || workspaceDirty} onClick={() => void transition(submitOffer, active, "Offer submitted for approval")}><Send className="h-4 w-4" />Submit for approval</Button>
              </DialogFooter>
            </div>
          </> : active ? <>
            <CmsWorkspaceHeader title={active.title} description={`${STATUS_LABEL[active.status]} · ${active.partner_name ?? "Partner incomplete"} · ${discountText(active)}`} />
            <CmsWorkspaceLayout
              previewFirst={isAdmin}
              editor={<div className="space-y-5">
                <section className="space-y-4 rounded-xl border border-border p-4">
                  <ReadOnlyField label="Campaign title" value={active.title} />
                  <ReadOnlyField label="Partner" value={active.partner_name} />
                  <ReadOnlyField label="Description" value={active.description} />
                  <ReadOnlyField label="Coupon code" value={active.code} />
                  <ReadOnlyField label="Partner destination" value={active.redemption_url} />
                  <ReadOnlyField label="Terms summary" value={active.terms_summary} />
                  <ReadOnlyField label="Full terms URL" value={active.terms_url} />
                  {active.review_note ? <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>Reviewer note:</strong> {active.review_note}</p> : null}
                  <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-text-secondary">Audience</dt><dd className="font-medium">{audienceSummary(active.audience_rules)}</dd></div><div><dt className="text-text-secondary">Line</dt><dd className="font-medium">{active.business_line === "both" ? "Both lines" : active.business_line}</dd></div></dl>
                </section>
                {isAdmin && reviewAction ? <div><Label htmlFor="offer-review-note">{reviewAction === "remove" ? "Removal reason" : "Change request"}</Label><Textarea id="offer-review-note" name="review_note" maxLength={1000} aria-describedby="offer-review-note-hint" value={reviewNote} placeholder={reviewAction === "remove" ? "Explain why this campaign must be removed" : "Explain exactly what the Sub Admin should change"} onChange={(event) => setReviewNote(event.target.value)} /><p id="offer-review-note-hint" className="mt-1 text-xs text-text-secondary">Required; this note is sent to the campaign author and retained in the audit trail.</p></div> : null}
                <DialogFooter>
                  {isAdmin && reviewAction ? <><Button variant="ghost" disabled={busy} onClick={() => { setReviewAction(null); setReviewNote(""); }}>Back</Button><Button variant={reviewAction === "remove" ? "destructive" : "default"} disabled={busy} onClick={() => void (reviewAction === "remove" ? removeReviewed(active) : reject(active))}>{reviewAction === "remove" ? <Trash2 className="h-4 w-4" /> : <X className="h-4 w-4" />}{reviewAction === "remove" ? "Confirm removal" : "Send change request"}</Button></> : null}
                  {isAdmin && !reviewAction && active.status === "pending_approval" ? <><Button variant="outline" disabled={busy} onClick={() => setReviewAction("changes")}><X className="h-4 w-4" />Request changes</Button><Button disabled={busy} onClick={() => void transition(approveOffer, active, "Offer approved")}><Check className="h-4 w-4" />Approve</Button></> : null}
                  {isAdmin && !reviewAction ? <Button variant="destructive" disabled={busy} onClick={() => setReviewAction("remove")}><Trash2 className="h-4 w-4" />Remove</Button> : null}
                  {!isAdmin && active.status === "approved" ? <><Button variant="outline" disabled={busy} onClick={() => void transition(scheduleOffer, active, "Offer scheduled")}><CalendarClock className="h-4 w-4" />Schedule</Button><Button disabled={busy} onClick={() => void transition(activateOffer, active, "Offer activated")}><Check className="h-4 w-4" />Activate now</Button></> : null}
                  {!isAdmin && (active.status === "scheduled" || active.status === "active" || active.status === "expired") ? <Button variant="outline" disabled={busy} onClick={() => void transition(archiveOffer, active, "Offer archived")}><Archive className="h-4 w-4" />Archive</Button> : null}
                </DialogFooter>
              </div>}
              preview={<CmsPreviewFrame title="Dashboard appearance" description="Coupon codes are never rendered on public pages." contexts={[{ value: "dashboard", label: "Dashboard" }]} context="dashboard" onContextChange={() => undefined} device={device} onDeviceChange={setDevice}><OfferPreview offer={active} /></CmsPreviewFrame>}
            />
          </> : null}
        </DialogContent>
      </Dialog>

      {isAdmin ? null : <Dialog open={createOpen} onOpenChange={closeCreate}><DialogContent showCloseButton={false} className={CMS_WORKSPACE_DIALOG_CLASS}><CmsWorkspaceHeader title="New dashboard offer" description="Create a complete private draft before sending it to Admin." /><div className="min-h-0 overflow-y-auto py-2"><OfferForm embedded onDirtyChange={setCreateDirty} onCreated={() => { setCreateDirty(false); setCreateOpen(false); void reload(); }} /></div></DialogContent></Dialog>}
    </DashboardPage>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string | null }) {
  return <div><p className="text-xs font-medium text-text-secondary">{label}</p><p className="mt-1 break-words text-sm text-text-primary">{value || "Not set"}</p></div>;
}
