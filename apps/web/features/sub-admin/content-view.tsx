"use client";

import * as React from "react";
import { Archive, Inbox, Loader2, Plus, Send } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdminPagination, ADMIN_PAGE_SIZE } from "@/features/admin/admin-list-tools";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import { DashboardHeader, DashboardPage, MetricCard, MetricGrid } from "@/features/dashboard/dashboard-ui";
import { archiveContentBlock, publishContentBlock, updateContentBlock, type ContentBlock } from "@/lib/content-api";

import { filterContent, type QueueFilters } from "./cms-filters";
import { ContentForm } from "./content-form";
import { ContentPreview } from "./cms-previews";
import { CmsFilterBar, CmsPreviewFrame, CmsWorkspaceHeader, CmsWorkspaceLayout, CMS_WORKSPACE_DIALOG_CLASS, type PreviewDevice } from "./cms-workspace";
import { ContentGuideButton } from "./content-guide";
import { useContentQueue } from "./use-content-queue";

const STATUS_LABEL: Record<ContentBlock["status"], string> = { draft: "Draft", published: "Published", archived: "Archived" };
const STATUS_VARIANT: Record<ContentBlock["status"], "secondary" | "outline"> = { draft: "outline", published: "secondary", archived: "outline" };
const EMPTY_FILTERS: QueueFilters = { search: "", status: "all", line: "all", kind: "all", from: "", to: "" };
const EDITABLE = new Set<ContentBlock["status"]>(["draft", "published"]);
const LINE_OPTIONS = [{ value: "loans", label: "Loans" }, { value: "real_estate", label: "Real Estate" }, { value: "global", label: "Global" }];
function lineText(item: ContentBlock) { return item.business_line ? item.business_line === "real_estate" ? "Real Estate" : "Loans" : "Global"; }

export function ContentView() {
  const { items, loading, error, reload } = useContentQueue();
  const [filters, setFilters] = React.useState(EMPTY_FILTERS);
  const [page, setPage] = React.useState(0);
  const filtered = React.useMemo(() => filterContent(items, filters), [filters, items]);
  React.useEffect(() => setPage(0), [filters]);
  const pageItems = filtered.slice(page * ADMIN_PAGE_SIZE, (page + 1) * ADMIN_PAGE_SIZE);
  const [active, setActive] = React.useState<ContentBlock | null>(null);
  const [title, setTitle] = React.useState("");
  const [section, setSection] = React.useState("");
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [device, setDevice] = React.useState<PreviewDevice>("desktop");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createDirty, setCreateDirty] = React.useState(false);
  const dirty = Boolean(active && EDITABLE.has(active.status) && (title !== active.title || section !== active.section || body !== (active.body ?? "")));
  function closeWorkspace(openState: boolean) { if (openState || busy) return; if (dirty && !window.confirm("Discard unsaved content changes?")) return; setActive(null); }
  function closeCreate(openState: boolean) { if (openState) return setCreateOpen(true); if (createDirty && !window.confirm("Discard this content draft?")) return; setCreateOpen(false); setCreateDirty(false); }
  function open(item: ContentBlock) { setActive(item); setTitle(item.title); setSection(item.section); setBody(item.body ?? ""); }
  async function save(item: ContentBlock) { if (!title.trim() || !section.trim()) return void toast.error("Title and section are required"); if (item.status === "published" && !body.trim()) return void toast.error("A published block needs a body"); setBusy(true); const result = await updateContentBlock(item.id, { title: title.trim(), section: section.trim(), body: body.trim() || null }); setBusy(false); if (result.ok) { toast.success("Content updated"); setActive(result.data); void reload(); } else toast.error("Could not update content", { description: result.error }); }
  async function advance(action: typeof publishContentBlock, item: ContentBlock, message: string) { setBusy(true); const result = await action(item.id); setBusy(false); if (result.ok) { toast.success(message); setActive(null); void reload(); } else toast.error("Could not update content", { description: result.error }); }

  return (
    <DashboardPage>
      <DashboardHeader eyebrow="Website content" title="Website content" description="Author reusable public-site copy with clear placement, lifecycle, and preview guidance." actions={<><ContentGuideButton /><Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />New block</Button></>} />
      <MetricGrid><MetricCard label="Total blocks" value={items.length} icon={DASHBOARD_ICONS.websiteContent} /><MetricCard label="Drafts" value={items.filter((item) => item.status === "draft").length} icon={DASHBOARD_ICONS.websiteContent} /><MetricCard label="Published" value={items.filter((item) => item.status === "published").length} icon={DASHBOARD_ICONS.analytics} /><MetricCard label="Archived" value={items.filter((item) => item.status === "archived").length} icon={Archive} /></MetricGrid>
      <CmsFilterBar value={filters} onChange={setFilters} searchLabel="Search content blocks" statusOptions={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))} lineOptions={LINE_OPTIONS} />
      {loading ? <Loading /> : error ? <ErrorState error={error} reload={reload} /> : filtered.length === 0 ? <Empty filtered={items.length > 0} /> : <><p className="text-sm text-text-secondary">{filtered.length} {filtered.length === 1 ? "block" : "blocks"} shown</p><ul className="space-y-3">{pageItems.map((item) => <li key={item.id}><button type="button" onClick={() => open(item)} className="flex w-full items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"><div className="min-w-0"><p className="truncate font-medium">{item.title}</p><p className="mt-0.5 truncate text-xs text-text-secondary">{item.section} · /{item.slug} · {lineText(item)}</p></div><Badge variant={STATUS_VARIANT[item.status]}>{STATUS_LABEL[item.status]}</Badge></button></li>)}</ul><AdminPagination page={page} total={filtered.length} onPageChange={setPage} /></>}
      <Dialog open={active !== null} onOpenChange={closeWorkspace}><DialogContent showCloseButton={false} className={CMS_WORKSPACE_DIALOG_CLASS}>{active ? <><CmsWorkspaceHeader title={active.title} description={`${STATUS_LABEL[active.status]} · ${lineText(active)} · /${active.slug}`} /><CmsWorkspaceLayout editor={<div className="space-y-5"><section className="space-y-4 rounded-xl border border-border p-4"><div><Label htmlFor="content-title">Title</Label><Input id="content-title" value={EDITABLE.has(active.status) ? title : active.title} disabled={!EDITABLE.has(active.status)} onChange={(event) => setTitle(event.target.value)} /></div><div><Label htmlFor="content-section">Section</Label><Input id="content-section" value={EDITABLE.has(active.status) ? section : active.section} disabled={!EDITABLE.has(active.status)} onChange={(event) => setSection(event.target.value)} /></div><div><Label htmlFor="content-body">Body</Label><Textarea id="content-body" rows={12} value={EDITABLE.has(active.status) ? body : active.body ?? ""} disabled={!EDITABLE.has(active.status)} onChange={(event) => setBody(event.target.value)} /></div><p className="text-xs text-text-secondary">Slug and business line are immutable after creation. The website only renders this block where its slug is explicitly consumed.</p></section><div className="flex flex-wrap items-center justify-between gap-3"><ContentGuideButton /><DialogFooter>{EDITABLE.has(active.status) ? <Button variant="outline" disabled={busy} onClick={() => void save(active)}>Save changes</Button> : null}{active.status !== "archived" ? <Button variant="outline" disabled={busy} onClick={() => void advance(archiveContentBlock, active, "Content archived")}><Archive className="h-4 w-4" />Archive</Button> : null}{active.status === "draft" ? <Button disabled={busy} onClick={() => void advance(publishContentBlock, active, "Content published")}><Send className="h-4 w-4" />Publish</Button> : null}</DialogFooter></div></div>} preview={<CmsPreviewFrame title="Public content section" description="This mirrors the plain-text content-block presentation used on public pages." device={device} onDeviceChange={setDevice}><ContentPreview block={{ title: EDITABLE.has(active.status) ? title : active.title, body: EDITABLE.has(active.status) ? body : active.body }} /></CmsPreviewFrame>} /></> : null}</DialogContent></Dialog>
      <Dialog open={createOpen} onOpenChange={closeCreate}><DialogContent showCloseButton={false} className={CMS_WORKSPACE_DIALOG_CLASS}><CmsWorkspaceHeader title="New content block" description="Use the guide and live preview before publishing website copy." /><div className="min-h-0 overflow-y-auto py-2"><ContentForm embedded onDirtyChange={setCreateDirty} onCreated={() => { setCreateDirty(false); setCreateOpen(false); void reload(); }} /></div></DialogContent></Dialog>
    </DashboardPage>
  );
}

function Loading() { return <div className="flex min-h-64 items-center justify-center rounded-xl border border-border bg-card"><Loader2 className="h-6 w-6 animate-spin text-brand-navy" /></div>; }
function ErrorState({ error, reload }: { error: string; reload: () => Promise<void> }) { return <div className="rounded-xl border border-border bg-card p-8 text-center"><p className="text-sm text-text-secondary">{error}</p><Button variant="outline" className="mt-4" onClick={() => void reload()}>Try again</Button></div>; }
function Empty({ filtered }: { filtered: boolean }) { return <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-border bg-card p-8 text-center"><Inbox className="h-8 w-8 text-text-secondary" /><p className="mt-3 font-medium">{filtered ? "No content matches these filters" : "No content blocks yet"}</p><p className="mt-1 text-sm text-text-secondary">{filtered ? "Clear or adjust the advanced filters." : "Write the first website content block to get started."}</p></div>; }
