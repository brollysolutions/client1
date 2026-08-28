"use client";

import * as React from "react";
import { Archive, CalendarClock, Check, Inbox, Plus, Send, X } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
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
  rejectOffer,
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

export function OffersView() {
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";
  const { items, loading, error, reload } = useOfferQueue();
  const [filters, setFilters] = React.useState<FilterBarValue>(EMPTY_FILTERS);
  const filtered = React.useMemo(() => filterOffers(items, filters), [filters, items]);
  const page = useFilteredPage(filtered, filters);
  const [active, setActive] = React.useState<Offer | null>(null);
  const [workspaceDirty, setWorkspaceDirty] = React.useState(false);
  const [reviewNote, setReviewNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [device, setDevice] = React.useState<PreviewDevice>("desktop");
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
  }

  function closeWorkspace(nextOpen: boolean) {
    if (nextOpen || busy) return;
    if (workspaceDirty && !window.confirm("Discard unsaved offer changes?")) return;
    setActive(null);
    setWorkspaceDirty(false);
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

  return (
    <DashboardPage>
      <DashboardHeader
        title={isAdmin ? "Offer approvals" : "Dashboard offers"}
        description={isAdmin ? "Approve complete partner coupon campaigns before they can reach a dashboard." : "Create role-targeted partner coupons, submit them for approval, then schedule or activate them."}
        actions={isAdmin ? undefined : <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" aria-hidden="true" />New offer</Button>}
      />
      <MetricGrid>
        <MetricCard label="Total campaigns" value={items.length} icon={DASHBOARD_ICONS.offers} />
        <MetricCard label="Pending review" value={items.filter((item) => item.status === "pending_approval").length} icon={DASHBOARD_ICONS.websiteContent} />
        <MetricCard label="Approved" value={items.filter((item) => item.status === "approved" || item.status === "scheduled").length} icon={CalendarClock} />
        <MetricCard label="Live" value={items.filter((item) => item.status === "active").length} icon={DASHBOARD_ICONS.analytics} />
      </MetricGrid>
      <FilterBar value={filters} onChange={setFilters} searchLabel="Search offers" searchPlaceholder="Campaign, partner, description, or code" statusOptions={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))} statusLabel="offer states" kindLabel="discount types" kindOptions={KIND_OPTIONS} note="Coupon campaigns are dashboard-only and require explicit role targeting." />
      {error ? <FetchError status={null} message={error} onRetry={() => void reload()} /> : (
        <DashboardPanel title={isAdmin ? "Approval queue and history" : "Campaign library"} description={`${filtered.length} ${filtered.length === 1 ? "campaign" : "campaigns"} shown.`} bodyClassName="p-0">
          {loading ? <div className="p-5"><ListLoadingState rows={5} /></div> : filtered.length === 0 ? <ListEmptyState icon={Inbox} title={items.length ? "No campaigns match these filters" : "No dashboard offers yet"} description={items.length ? "Clear or adjust the filters." : isAdmin ? "Submitted campaigns will appear here." : "Create the first partner coupon campaign."} className="m-5" /> : <><DataTable columns={columns} rows={page.pageRows} rowKey={(item) => item.id} onRowClick={open} rowActionLabel="Open offer workspace" minWidth="min-w-[820px]" /><div className="px-5 pb-5"><ListPagination page={page.page} total={page.total} onPageChange={page.setPage} /></div></>}
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
                <Button variant="outline" disabled={busy} onClick={() => void transition(archiveOffer, active, "Offer archived")}><Archive className="h-4 w-4" />Archive</Button>
                <Button disabled={busy || workspaceDirty} onClick={() => void transition(submitOffer, active, "Offer submitted for approval")}><Send className="h-4 w-4" />Submit for approval</Button>
              </DialogFooter>
            </div>
          </> : active ? <>
            <CmsWorkspaceHeader title={active.title} description={`${STATUS_LABEL[active.status]} · ${active.partner_name ?? "Partner incomplete"} · ${discountText(active)}`} />
            <CmsWorkspaceLayout
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
                {isAdmin && active.status === "pending_approval" ? <div><Label htmlFor="offer-review-note">Change request note</Label><Textarea id="offer-review-note" name="review_note" maxLength={1000} aria-describedby="offer-review-note-hint" value={reviewNote} placeholder="Required only when requesting changes" onChange={(event) => setReviewNote(event.target.value)} /><p id="offer-review-note-hint" className="mt-1 text-xs text-text-secondary">Required when requesting changes; up to 1,000 characters.</p></div> : null}
                <DialogFooter>
                  {isAdmin && active.status === "pending_approval" ? <><Button variant="outline" disabled={busy} onClick={() => void reject(active)}><X className="h-4 w-4" />Request changes</Button><Button disabled={busy} onClick={() => void transition(approveOffer, active, "Offer approved")}><Check className="h-4 w-4" />Approve</Button></> : null}
                  {!isAdmin && active.status === "approved" ? <><Button variant="outline" disabled={busy} onClick={() => void transition(scheduleOffer, active, "Offer scheduled")}><CalendarClock className="h-4 w-4" />Schedule</Button><Button disabled={busy} onClick={() => void transition(activateOffer, active, "Offer activated")}><Check className="h-4 w-4" />Activate now</Button></> : null}
                  {!isAdmin && (active.status === "scheduled" || active.status === "active" || active.status === "expired") ? <Button variant="outline" disabled={busy} onClick={() => void transition(archiveOffer, active, "Offer archived")}><Archive className="h-4 w-4" />Archive</Button> : null}
                </DialogFooter>
              </div>}
              preview={<CmsPreviewFrame title="Dashboard appearance" description="Coupon codes are never rendered on public pages." contexts={[{ value: "dashboard", label: "Dashboard" }]} context="dashboard" onContextChange={() => undefined} device={device} onDeviceChange={setDevice}><OfferPreview offer={active} /></CmsPreviewFrame>}
            />
          </> : null}
        </DialogContent>
      </Dialog>

      {isAdmin ? null : <Dialog open={createOpen} onOpenChange={(next) => { if (!next && createDirty && !window.confirm("Discard this offer draft?")) return; setCreateOpen(next); if (!next) setCreateDirty(false); }}><DialogContent showCloseButton={false} className={CMS_WORKSPACE_DIALOG_CLASS}><CmsWorkspaceHeader title="New dashboard offer" description="Create a complete private draft before sending it to Admin." /><div className="min-h-0 overflow-y-auto py-2"><OfferForm embedded onDirtyChange={setCreateDirty} onCreated={() => { setCreateDirty(false); setCreateOpen(false); void reload(); }} /></div></DialogContent></Dialog>}
    </DashboardPage>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string | null }) {
  return <div><p className="text-xs font-medium text-text-secondary">{label}</p><p className="mt-1 break-words text-sm text-text-primary">{value || "Not set"}</p></div>;
}
