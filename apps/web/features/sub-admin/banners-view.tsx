"use client";

import * as React from "react";
import { Archive, CheckCircle2, Inbox, Loader2, Plus, Send, XCircle } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import { DashboardHeader, DashboardPage, MetricCard, MetricGrid } from "@/features/dashboard/dashboard-ui";
import { AdminPagination, ADMIN_PAGE_SIZE } from "@/features/admin/admin-list-tools";
import { approveBanner, rejectBanner, submitBanner, updateBanner, type Banner } from "@/lib/banners-api";

import { audienceSummary } from "./audience-rule-fields";
import { BannerForm } from "./banner-form";
import { filterBanners, type QueueFilters } from "./cms-filters";
import { BannerPreview } from "./cms-previews";
import { CmsFilterBar, CmsPreviewFrame, CmsWorkspaceHeader, CmsWorkspaceLayout, CMS_WORKSPACE_DIALOG_CLASS, type PreviewDevice } from "./cms-workspace";
import { useBannerQueue } from "./use-banner-queue";

const STATUS_LABEL: Record<Banner["status"], string> = { draft: "Draft", pending_approval: "Pending approval", approved: "Approved", live: "Live", rejected: "Rejected", archived: "Archived" };
const STATUS_VARIANT: Record<Banner["status"], "secondary" | "outline" | "destructive"> = { draft: "outline", pending_approval: "secondary", approved: "secondary", live: "secondary", rejected: "destructive", archived: "outline" };
const EMPTY_FILTERS: QueueFilters = { search: "", status: "all", line: "all", kind: "all", from: "", to: "" };
const EDITABLE = new Set<Banner["status"]>(["draft", "rejected"]);

export function BannersView() {
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";
  const { items, loading, error, reload } = useBannerQueue();
  const [filters, setFilters] = React.useState(EMPTY_FILTERS);
  const [page, setPage] = React.useState(0);
  const filtered = React.useMemo(() => filterBanners(items, filters), [filters, items]);
  React.useEffect(() => setPage(0), [filters]);
  const pageItems = filtered.slice(page * ADMIN_PAGE_SIZE, (page + 1) * ADMIN_PAGE_SIZE);
  const [active, setActive] = React.useState<Banner | null>(null);
  const [rejecting, setRejecting] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [draftTitle, setDraftTitle] = React.useState("");
  const [draftDeepLink, setDraftDeepLink] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [previewContext, setPreviewContext] = React.useState("public");
  const [device, setDevice] = React.useState<PreviewDevice>("desktop");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createDirty, setCreateDirty] = React.useState(false);
  const dirty = Boolean(active && EDITABLE.has(active.status) && (draftTitle !== active.title || draftDeepLink !== (active.deep_link ?? "")));
  function closeWorkspace(openState: boolean) { if (openState || busy) return; if (dirty && !window.confirm("Discard unsaved banner changes?")) return; setActive(null); }
  function closeCreate(openState: boolean) { if (openState) return setCreateOpen(true); if (createDirty && !window.confirm("Discard this banner draft?")) return; setCreateOpen(false); setCreateDirty(false); }

  function openBanner(banner: Banner) { setActive(banner); setRejecting(false); setNote(""); setDraftTitle(banner.title); setDraftDeepLink(banner.deep_link ?? ""); }
  async function save(banner: Banner) {
    if (!draftTitle.trim()) return void toast.error("Title can't be empty");
    setBusy(true); const result = await updateBanner(banner.id, { title: draftTitle.trim(), deep_link: draftDeepLink.trim() || null }); setBusy(false);
    if (result.ok) { toast.success("Banner updated"); setActive(result.data); void reload(); } else toast.error("Could not update banner", { description: result.error });
  }
  async function advance(action: (id: string) => ReturnType<typeof submitBanner>, banner: Banner, message: string) {
    setBusy(true); const result = await action(banner.id); setBusy(false);
    if (result.ok) { toast.success(message); setActive(null); void reload(); } else toast.error("Could not update banner", { description: result.error });
  }
  async function reject(banner: Banner) {
    if (!note.trim()) return void toast.error("Add a reason", { description: "Tell the Sub Admin why this was rejected." });
    setBusy(true); const result = await rejectBanner(banner.id, note.trim()); setBusy(false);
    if (result.ok) { toast.success("Banner rejected"); setActive(null); void reload(); } else toast.error("Could not reject", { description: result.error });
  }

  return (
    <DashboardPage>
      <DashboardHeader eyebrow="Campaign content" title="Banners" description="Create, target, preview, and track banners through Admin approval." actions={!isAdmin ? <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />New banner</Button> : undefined} />
      <MetricGrid>
        <MetricCard label="Total banners" value={items.length} icon={DASHBOARD_ICONS.banners} />
        <MetricCard label="Drafts" value={items.filter((item) => item.status === "draft").length} icon={DASHBOARD_ICONS.websiteContent} />
        <MetricCard label="Waiting for approval" value={items.filter((item) => item.status === "pending_approval").length} icon={DASHBOARD_ICONS.documentVerification} attention={items.some((item) => item.status === "pending_approval")} />
        <MetricCard label="Live" value={items.filter((item) => item.status === "live").length} icon={DASHBOARD_ICONS.analytics} />
      </MetricGrid>
      <CmsFilterBar value={filters} onChange={setFilters} searchLabel="Search banners" statusOptions={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))} kindLabel="banner types" kindOptions={[{ value: "default", label: "Default" }, { value: "action", label: "Action" }, { value: "personalized", label: "Personalized" }]} />
      {loading ? <Loading /> : error ? <ErrorState error={error} reload={reload} /> : filtered.length === 0 ? <Empty filtered={items.length > 0} /> : (
        <><p className="text-sm text-text-secondary">{filtered.length} {filtered.length === 1 ? "banner" : "banners"} shown</p><ul className="space-y-3">{pageItems.map((banner) => <li key={banner.id}><button type="button" onClick={() => openBanner(banner)} className="flex w-full items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"><div className="min-w-0"><p className="truncate font-medium text-text-primary">{banner.title}</p><p className="mt-0.5 truncate text-xs text-text-secondary">{banner.business_line === "both" ? "Both lines" : banner.business_line} · {audienceSummary(banner.audience_rules)} · Priority {banner.priority}</p></div><Badge variant={STATUS_VARIANT[banner.status]}>{STATUS_LABEL[banner.status]}</Badge></button></li>)}</ul><AdminPagination page={page} total={filtered.length} onPageChange={setPage} /></>
      )}
      <Dialog open={active !== null} onOpenChange={closeWorkspace}>
        <DialogContent showCloseButton={false} className={CMS_WORKSPACE_DIALOG_CLASS}>{active ? <><CmsWorkspaceHeader title={active.title} description={`${STATUS_LABEL[active.status]} · ${active.business_line === "both" ? "Both lines" : active.business_line} · ${audienceSummary(active.audience_rules)}`} /><CmsWorkspaceLayout editor={<div className="space-y-5"><section className="space-y-4 rounded-xl border border-border p-4"><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="banner-title">Title</Label><Input id="banner-title" value={EDITABLE.has(active.status) ? draftTitle : active.title} disabled={!EDITABLE.has(active.status)} onChange={(event) => setDraftTitle(event.target.value)} /></div><div><Label htmlFor="banner-link">Deep link</Label><Input id="banner-link" value={EDITABLE.has(active.status) ? draftDeepLink : active.deep_link ?? ""} disabled={!EDITABLE.has(active.status)} onChange={(event) => setDraftDeepLink(event.target.value)} /></div></div><dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-text-secondary">Type</dt><dd className="font-medium">{active.banner_type}</dd></div><div><dt className="text-text-secondary">Priority</dt><dd className="font-medium">{active.priority}</dd></div><div><dt className="text-text-secondary">Starts</dt><dd className="font-medium">{active.starts_at ? new Date(active.starts_at).toLocaleString("en-IN") : "After approval"}</dd></div><div><dt className="text-text-secondary">Ends</dt><dd className="font-medium">{active.ends_at ? new Date(active.ends_at).toLocaleString("en-IN") : "No automatic end"}</dd></div></dl>{active.review_note ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">Review note: {active.review_note}</p> : null}{rejecting ? <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Reason for rejection" /> : null}</section><DialogFooter>{isAdmin && active.status === "pending_approval" ? rejecting ? <><Button variant="ghost" onClick={() => setRejecting(false)}>Back</Button><Button variant="destructive" disabled={busy} onClick={() => void reject(active)}><XCircle className="h-4 w-4" />Confirm reject</Button></> : <><Button variant="outline" onClick={() => setRejecting(true)}>Reject</Button><Button disabled={busy} onClick={() => void advance(approveBanner, active, "Banner approved")}><CheckCircle2 className="h-4 w-4" />Approve</Button></> : EDITABLE.has(active.status) ? <><Button variant="outline" disabled={busy} onClick={() => void save(active)}>Save changes</Button><Button disabled={busy} onClick={() => void advance(submitBanner, active, "Submitted for approval")}><Send className="h-4 w-4" />Submit for approval</Button></> : active.status === "live" ? <Button variant="outline" disabled><Archive className="h-4 w-4" />Managed by schedule</Button> : null}</DialogFooter></div>} preview={<CmsPreviewFrame title="Banner appearance" description="Compare the two production presentation contexts." contexts={[{ value: "public", label: "Public hero" }, { value: "dashboard", label: "Dashboard" }]} context={previewContext} onContextChange={setPreviewContext} device={device} onDeviceChange={setDevice}><BannerPreview context={previewContext as "public" | "dashboard"} banner={{ ...active, title: EDITABLE.has(active.status) ? draftTitle : active.title, deep_link: EDITABLE.has(active.status) ? draftDeepLink : active.deep_link }} /></CmsPreviewFrame>} /></> : null}</DialogContent>
      </Dialog>
      {!isAdmin ? <Dialog open={createOpen} onOpenChange={closeCreate}><DialogContent showCloseButton={false} className={CMS_WORKSPACE_DIALOG_CLASS}><CmsWorkspaceHeader title="New banner" description="Create and preview a draft before submitting it for Admin approval." /><div className="min-h-0 overflow-y-auto py-2"><BannerForm embedded onDirtyChange={setCreateDirty} onCreated={() => { setCreateDirty(false); setCreateOpen(false); void reload(); }} /></div></DialogContent></Dialog> : null}
    </DashboardPage>
  );
}

function Loading() { return <div className="flex min-h-64 items-center justify-center rounded-xl border border-border bg-card"><Loader2 className="h-6 w-6 animate-spin text-brand-navy" /></div>; }
function ErrorState({ error, reload }: { error: string; reload: () => Promise<void> }) { return <div className="rounded-xl border border-border bg-card p-8 text-center"><p className="text-sm text-text-secondary">{error}</p><Button variant="outline" className="mt-4" onClick={() => void reload()}>Try again</Button></div>; }
function Empty({ filtered }: { filtered: boolean }) { return <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-border bg-card p-8 text-center"><Inbox className="h-8 w-8 text-text-secondary" /><p className="mt-3 font-medium">{filtered ? "No banners match these filters" : "No banners yet"}</p><p className="mt-1 text-sm text-text-secondary">{filtered ? "Clear or adjust the advanced filters." : "Create the first banner draft to get started."}</p></div>; }
