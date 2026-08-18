"use client";

import * as React from "react";
import {
  Archive,
  CheckCircle2,
  CopyPlus,
  Inbox,
  Loader2,
  Plus,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AdminPagination, ADMIN_PAGE_SIZE } from "@/features/admin/admin-list-tools";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import {
  DashboardHeader,
  DashboardPage,
  MetricCard,
  MetricGrid,
} from "@/features/dashboard/dashboard-ui";
import {
  approveBanner,
  archiveBanner,
  createBannerReplacement,
  deleteBanner,
  listBannerTemplates,
  rejectBanner,
  submitBanner,
  updateBanner,
  type Banner,
  type BannerTemplate,
} from "@/lib/banners-api";
import { listOffers, type Offer } from "@/lib/offers-api";

import { audienceSummary } from "./audience-rule-fields";
import { BannerForm } from "./banner-form";
import { BannerTemplateManager } from "./banner-template-manager";
import { filterBanners, type QueueFilters } from "./cms-filters";
import { BannerPreview, formatOfferBadge } from "./cms-previews";
import {
  CmsFilterBar,
  CmsPreviewFrame,
  CmsWorkspaceHeader,
  CmsWorkspaceLayout,
  CMS_WORKSPACE_DIALOG_CLASS,
  type PreviewDevice,
} from "./cms-workspace";
import { useBannerQueue } from "./use-banner-queue";

const STATUS_LABEL: Record<Banner["status"], string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  live: "Live",
  rejected: "Rejected",
  archived: "Archived",
};
const STATUS_VARIANT: Record<Banner["status"], "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  pending_approval: "secondary",
  approved: "secondary",
  live: "secondary",
  rejected: "destructive",
  archived: "outline",
};
const EMPTY_FILTERS: QueueFilters = {
  search: "",
  status: "all",
  line: "all",
  kind: "all",
  from: "",
  to: "",
};
const EDITABLE = new Set<Banner["status"]>(["draft", "rejected"]);
const REPLACEABLE = new Set<Banner["status"]>(["approved", "live", "archived"]);

type Draft = {
  title: string;
  subtitle: string;
  ctaLabel: string;
  deepLink: string;
  templateId: string;
  offerId: string;
  priority: string;
  startsAt: string;
  endsAt: string;
};

function localDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toDraft(banner: Banner): Draft {
  return {
    title: banner.title,
    subtitle: banner.subtitle ?? "",
    ctaLabel: banner.cta_label ?? "",
    deepLink: banner.deep_link ?? "",
    templateId: banner.template_id ?? "",
    offerId: banner.offer_id ?? "",
    priority: String(banner.priority),
    startsAt: localDateTime(banner.starts_at),
    endsAt: localDateTime(banner.ends_at),
  };
}

export function BannersView() {
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";
  const { items, loading, error, reload } = useBannerQueue();
  const [filters, setFilters] = React.useState(EMPTY_FILTERS);
  const [page, setPage] = React.useState(0);
  const [active, setActive] = React.useState<Banner | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [templates, setTemplates] = React.useState<BannerTemplate[]>([]);
  const [offers, setOffers] = React.useState<Offer[]>([]);
  const [rejecting, setRejecting] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [device, setDevice] = React.useState<PreviewDevice>("desktop");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createDirty, setCreateDirty] = React.useState(false);

  React.useEffect(() => {
    void Promise.all([listBannerTemplates(false), listOffers()]).then(
      ([templateResult, offerResult]) => {
        if (templateResult.ok) setTemplates(templateResult.data);
        if (offerResult.ok) setOffers(offerResult.data);
      },
    );
  }, []);

  const filtered = React.useMemo(() => filterBanners(items, filters), [filters, items]);
  React.useEffect(() => setPage(0), [filters]);
  const pageItems = filtered.slice(page * ADMIN_PAGE_SIZE, (page + 1) * ADMIN_PAGE_SIZE);
  const dirty = Boolean(active && draft && JSON.stringify(draft) !== JSON.stringify(toDraft(active)));

  const selectedTemplate = templates.find((template) => template.id === draft?.templateId);
  const selectedOffer = offers.find((offer) => offer.id === draft?.offerId);
  const categoryNeedsOffer = selectedTemplate?.category_key === "offers";
  const editableTemplates = templates.filter(
    (template) => template.active && template.placement === active?.placement,
  );
  const editableOffers = offers.filter(
    (offer) =>
      (offer.status === "active" || offer.status === "scheduled") &&
      (!active ||
        active.business_line === "both" ||
        offer.business_line === "both" ||
        offer.business_line === active.business_line),
  );

  function closeWorkspace(openState: boolean) {
    if (openState || busy) return;
    if (dirty && !window.confirm("Discard unsaved banner changes?")) return;
    setActive(null);
    setDraft(null);
  }

  function closeCreate(openState: boolean) {
    if (openState) return setCreateOpen(true);
    if (createDirty && !window.confirm("Discard this banner draft?")) return;
    setCreateOpen(false);
    setCreateDirty(false);
  }

  function openBanner(banner: Banner) {
    setActive(banner);
    setDraft(toDraft(banner));
    setRejecting(false);
    setNote("");
  }

  async function save(banner: Banner) {
    if (!draft?.title.trim()) return void toast.error("Title cannot be empty.");
    if (draft.startsAt && draft.endsAt && new Date(draft.endsAt) <= new Date(draft.startsAt)) {
      return void toast.error("The archive time must be after the go-live time.");
    }
    if (banner.placement !== "dashboard" && !draft.templateId) {
      return void toast.error("Choose an active artwork template.");
    }
    if (categoryNeedsOffer && !draft.offerId) {
      return void toast.error("Choose the linked Offer.");
    }
    setBusy(true);
    const result = await updateBanner(banner.id, {
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim() || null,
      cta_label: draft.ctaLabel.trim() || null,
      deep_link: draft.deepLink.trim() || null,
      template_id: banner.placement === "dashboard" ? null : draft.templateId,
      offer_id: categoryNeedsOffer ? draft.offerId : null,
      priority: Number(draft.priority) || 0,
      starts_at: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
      ends_at: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
    });
    setBusy(false);
    if (!result.ok) {
      return void toast.error("Could not update banner", { description: result.error });
    }
    toast.success("Banner updated");
    setActive(result.data);
    setDraft(toDraft(result.data));
    void reload();
  }

  async function advance(
    action: (id: string) => ReturnType<typeof submitBanner>,
    banner: Banner,
    message: string,
  ) {
    setBusy(true);
    const result = await action(banner.id);
    setBusy(false);
    if (!result.ok) return void toast.error("Could not update banner", { description: result.error });
    toast.success(message);
    setActive(null);
    setDraft(null);
    void reload();
  }

  async function reject(banner: Banner) {
    if (!note.trim()) return void toast.error("Add a reason for the Sub Admin.");
    setBusy(true);
    const result = await rejectBanner(banner.id, note.trim());
    setBusy(false);
    if (!result.ok) return void toast.error("Could not reject", { description: result.error });
    toast.success("Banner rejected");
    setActive(null);
    setDraft(null);
    void reload();
  }

  async function removeDraft(banner: Banner) {
    if (!window.confirm("Delete this never-submitted draft? This cannot be undone.")) return;
    setBusy(true);
    const result = await deleteBanner(banner.id);
    setBusy(false);
    if (!result.ok) return void toast.error("Could not delete draft", { description: result.error });
    toast.success("Draft deleted");
    setActive(null);
    setDraft(null);
    void reload();
  }

  async function archive(banner: Banner) {
    if (!window.confirm("Archive this banner? It will stop appearing publicly.")) return;
    await advance(archiveBanner, banner, "Banner archived");
  }

  async function replace(banner: Banner) {
    setBusy(true);
    const result = await createBannerReplacement(banner.id);
    setBusy(false);
    if (!result.ok) {
      return void toast.error("Could not create replacement", { description: result.error });
    }
    toast.success("Replacement draft created", {
      description: "The current banner stays live until the replacement is approved and activated.",
    });
    setActive(result.data);
    setDraft(toDraft(result.data));
    void reload();
  }

  return (
    <DashboardPage>
      <DashboardHeader
        eyebrow="Campaign content"
        title="Banners"
        description="Choose governed artwork, edit live copy, and move campaigns through Admin approval."
        actions={
          !isAdmin ? (
            <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />New banner</Button>
          ) : undefined
        }
      />
      {isAdmin ? <BannerTemplateManager /> : null}
      <MetricGrid>
        <MetricCard label="Total banners" value={items.length} icon={DASHBOARD_ICONS.banners} />
        <MetricCard label="Drafts" value={items.filter((item) => item.status === "draft").length} icon={DASHBOARD_ICONS.websiteContent} />
        <MetricCard label="Waiting for approval" value={items.filter((item) => item.status === "pending_approval").length} icon={DASHBOARD_ICONS.documentVerification} attention={items.some((item) => item.status === "pending_approval")} />
        <MetricCard label="Live" value={items.filter((item) => item.status === "live").length} icon={DASHBOARD_ICONS.analytics} />
      </MetricGrid>
      <CmsFilterBar
        value={filters}
        onChange={setFilters}
        searchLabel="Search banners"
        statusOptions={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
        kindLabel="banner types"
        kindOptions={[
          { value: "default", label: "Default" },
          { value: "action", label: "Action" },
          { value: "personalized", label: "Personalized" },
        ]}
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} reload={reload} />
      ) : filtered.length === 0 ? (
        <Empty filtered={items.length > 0} />
      ) : (
        <>
          <p className="text-sm text-text-secondary">
            {filtered.length} {filtered.length === 1 ? "banner" : "banners"} shown
          </p>
          <ul className="space-y-3">
            {pageItems.map((banner) => (
              <li key={banner.id}>
                <button
                  type="button"
                  onClick={() => openBanner(banner)}
                  className="flex w-full items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-text-primary">{banner.title}</p>
                    <p className="mt-0.5 truncate text-xs capitalize text-text-secondary">
                      {banner.placement.replaceAll("_", " ")} · {banner.category_key?.replaceAll("-", " ") ?? banner.banner_type} · Priority {banner.priority}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[banner.status]}>{STATUS_LABEL[banner.status]}</Badge>
                </button>
              </li>
            ))}
          </ul>
          <AdminPagination page={page} total={filtered.length} onPageChange={setPage} />
        </>
      )}

      <Dialog open={active !== null} onOpenChange={closeWorkspace}>
        <DialogContent showCloseButton={false} className={CMS_WORKSPACE_DIALOG_CLASS}>
          {active && draft ? (
            <>
              <CmsWorkspaceHeader
                title={active.title}
                description={`${STATUS_LABEL[active.status]} · ${active.placement.replaceAll("_", " ")} · ${audienceSummary(active.audience_rules)}`}
              />
              <CmsWorkspaceLayout
                editor={
                  <div className="space-y-5">
                    <section className="space-y-4 rounded-xl border border-border p-4">
                      <div>
                        <Label htmlFor="banner-title">Title</Label>
                        <Input id="banner-title" value={draft.title} disabled={!EDITABLE.has(active.status)} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor="banner-subtitle">Subtitle</Label>
                        <Input id="banner-subtitle" value={draft.subtitle} disabled={!EDITABLE.has(active.status)} onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })} />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <Label htmlFor="banner-cta">Button label</Label>
                          <Input id="banner-cta" value={draft.ctaLabel} disabled={!EDITABLE.has(active.status)} onChange={(event) => setDraft({ ...draft, ctaLabel: event.target.value })} />
                        </div>
                        <div>
                          <Label htmlFor="banner-link">Internal destination</Label>
                          <Input id="banner-link" value={draft.deepLink} disabled={!EDITABLE.has(active.status)} onChange={(event) => setDraft({ ...draft, deepLink: event.target.value })} />
                        </div>
                      </div>
                      {active.placement !== "dashboard" ? (
                        <div>
                          <Label htmlFor="edit-template">Artwork template</Label>
                          <Select value={draft.templateId || undefined} disabled={!EDITABLE.has(active.status)} onValueChange={(templateId) => setDraft({ ...draft, templateId, offerId: "" })}>
                            <SelectTrigger id="edit-template"><SelectValue placeholder="Choose a template" /></SelectTrigger>
                            <SelectContent>
                              {editableTemplates.map((template) => (
                                <SelectItem key={template.id} value={template.id}>{template.label} · version {template.version}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                      {categoryNeedsOffer ? (
                        <div>
                          <Label htmlFor="edit-offer">Linked Offer</Label>
                          <Select value={draft.offerId || undefined} disabled={!EDITABLE.has(active.status)} onValueChange={(offerId) => setDraft({ ...draft, offerId })}>
                            <SelectTrigger id="edit-offer"><SelectValue placeholder="Choose an Offer" /></SelectTrigger>
                            <SelectContent>
                              {editableOffers.map((offer) => <SelectItem key={offer.id} value={offer.id}>{offer.title}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div>
                          <Label htmlFor="banner-priority">Priority</Label>
                          <Input id="banner-priority" inputMode="numeric" value={draft.priority} disabled={!EDITABLE.has(active.status)} onChange={(event) => setDraft({ ...draft, priority: event.target.value.replace(/\D/g, "") })} />
                        </div>
                        <div>
                          <Label htmlFor="banner-start">Goes live at</Label>
                          <Input id="banner-start" type="datetime-local" value={draft.startsAt} disabled={!EDITABLE.has(active.status)} onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })} />
                        </div>
                        <div>
                          <Label htmlFor="banner-end">Archives at</Label>
                          <Input id="banner-end" type="datetime-local" value={draft.endsAt} disabled={!EDITABLE.has(active.status)} onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })} />
                        </div>
                      </div>
                      {active.review_note ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">Review note: {active.review_note}</p> : null}
                      {rejecting ? <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Reason for rejection" /> : null}
                    </section>
                    <DialogFooter className="flex-wrap">
                      {isAdmin && active.status === "pending_approval" ? (
                        rejecting ? (
                          <>
                            <Button variant="ghost" onClick={() => setRejecting(false)}>Back</Button>
                            <Button variant="destructive" disabled={busy} onClick={() => void reject(active)}><XCircle className="h-4 w-4" />Confirm reject</Button>
                          </>
                        ) : (
                          <>
                            <Button variant="outline" onClick={() => setRejecting(true)}>Reject</Button>
                            <Button disabled={busy} onClick={() => void advance(approveBanner, active, "Banner approved")}><CheckCircle2 className="h-4 w-4" />Approve</Button>
                          </>
                        )
                      ) : !isAdmin && EDITABLE.has(active.status) ? (
                        <>
                          {active.status === "draft" ? <Button variant="destructive" disabled={busy} onClick={() => void removeDraft(active)}><Trash2 className="h-4 w-4" />Delete draft</Button> : null}
                          <Button variant="outline" disabled={busy || !dirty} onClick={() => void save(active)}>Save changes</Button>
                          <Button disabled={busy || dirty} onClick={() => void advance(submitBanner, active, "Submitted for approval")}><Send className="h-4 w-4" />Submit for approval</Button>
                        </>
                      ) : !isAdmin && REPLACEABLE.has(active.status) ? (
                        <Button disabled={busy} onClick={() => void replace(active)}><CopyPlus className="h-4 w-4" />Create replacement</Button>
                      ) : null}
                      {active.status !== "draft" && active.status !== "archived" ? (
                        <Button variant="outline" disabled={busy} onClick={() => void archive(active)}><Archive className="h-4 w-4" />Archive</Button>
                      ) : null}
                    </DialogFooter>
                  </div>
                }
                preview={
                  <CmsPreviewFrame
                    title="Banner appearance"
                    description="Artwork, copy, Offer badge, and CTA match the production composition."
                    device={device}
                    onDeviceChange={setDevice}
                  >
                    <BannerPreview
                      context={active.placement === "dashboard" ? "dashboard" : "public"}
                      banner={{
                        banner_type: active.banner_type,
                        title: draft.title,
                        subtitle: draft.subtitle || null,
                        cta_label: draft.ctaLabel || null,
                        deep_link: draft.deepLink || null,
                        image_url: selectedTemplate?.image_url,
                        offer_badge: formatOfferBadge(selectedOffer),
                      }}
                    />
                  </CmsPreviewFrame>
                }
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {!isAdmin ? (
        <Dialog open={createOpen} onOpenChange={closeCreate}>
          <DialogContent showCloseButton={false} className={CMS_WORKSPACE_DIALOG_CLASS}>
            <CmsWorkspaceHeader title="New banner" description="Select governed artwork and preview the campaign before Admin review." />
            <div className="min-h-0 overflow-y-auto py-2">
              <BannerForm embedded onDirtyChange={setCreateDirty} onCreated={() => { setCreateDirty(false); setCreateOpen(false); void reload(); }} />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </DashboardPage>
  );
}

function Loading() {
  return <div className="flex min-h-64 items-center justify-center rounded-xl border border-border bg-card"><Loader2 className="h-6 w-6 animate-spin text-brand-navy" /></div>;
}

function ErrorState({ error, reload }: { error: string; reload: () => Promise<void> }) {
  return <div className="rounded-xl border border-border bg-card p-8 text-center"><p className="text-sm text-text-secondary">{error}</p><Button variant="outline" className="mt-4" onClick={() => void reload()}>Try again</Button></div>;
}

function Empty({ filtered }: { filtered: boolean }) {
  return <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-border bg-card p-8 text-center"><Inbox className="h-8 w-8 text-text-secondary" /><p className="mt-3 font-medium">{filtered ? "No banners match these filters" : "No banners yet"}</p><p className="mt-1 text-sm text-text-secondary">{filtered ? "Clear or adjust the advanced filters." : "Create the first banner draft to get started."}</p></div>;
}
