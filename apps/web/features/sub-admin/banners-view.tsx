"use client";

import * as React from "react";
import {
  Archive,
  CheckCircle2,
  CopyPlus,
  Inbox,
  Plus,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
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
import {
  apiIssuesToFieldErrors,
  integerError,
  focusFirstInvalidField,
  optionalTextError,
  requiredTextError,
  type FieldErrors,
} from "@/lib/form-validation";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import {
  DashboardHeader,
  DashboardPage,
  DashboardPanel,
  MetricCard,
  MetricGrid,
} from "@/features/dashboard/dashboard-ui";
import { DataTable, DataTablePrimaryCell, type DataColumn } from "@/features/dashboard/data-table";
import { FetchError } from "@/features/dashboard/fetch-error";
import { EMPTY_FILTERS, FilterBar, type FilterBarValue } from "@/features/dashboard/filter-bar";
import { ListEmptyState, ListLoadingState, ListPagination } from "@/features/dashboard/list-states";
import { StatusBadge, type StatusTone } from "@/features/dashboard/status-badge";
import { useFilteredPage } from "@/features/dashboard/use-filtered-page";
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
import {
  isPropertyCampaignTemplate,
  propertyCampaignHref,
  propertyCampaignImage,
  propertyMatchesCampaign,
} from "@/lib/banner-properties";
import { listOffers, type Offer } from "@/lib/offers-api";
import { getAdminProperties, type AdminProperty } from "@/lib/properties-api";
import { isSafeLocalHref } from "@/lib/safe-local-href";

import { audienceSummary } from "./audience-rule-fields";
import { BannerForm } from "./banner-form";
import { BannerTemplateManager } from "./banner-template-manager";
import { filterBanners } from "./cms-filters";
import { BannerPreview, formatOfferBadge } from "./cms-previews";
import {
  CmsPreviewFrame,
  CmsWorkspaceHeader,
  CmsWorkspaceLayout,
  CMS_WORKSPACE_DIALOG_CLASS,
  type PreviewDevice,
} from "./cms-workspace";
import { useBannerQueue } from "./use-banner-queue";
import { PropertyCampaignSelect } from "./property-campaign-select";

const STATUS_LABEL: Record<Banner["status"], string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  live: "Live",
  rejected: "Rejected",
  archived: "Archived",
};
const STATUS_TONE: Record<Banner["status"], StatusTone> = {
  draft: "neutral",
  pending_approval: "warning",
  approved: "info",
  live: "success",
  rejected: "danger",
  archived: "neutral",
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
  propertyId: string;
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
    propertyId: banner.property_id ?? "",
    priority: String(banner.priority),
    startsAt: localDateTime(banner.starts_at),
    endsAt: localDateTime(banner.ends_at),
  };
}

export function BannersView() {
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";
  const { items, loading, error, reload } = useBannerQueue();
  const [filters, setFilters] = React.useState<FilterBarValue>(EMPTY_FILTERS);
  const [active, setActive] = React.useState<Banner | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [templates, setTemplates] = React.useState<BannerTemplate[]>([]);
  const [offers, setOffers] = React.useState<Offer[]>([]);
  const [properties, setProperties] = React.useState<AdminProperty[]>([]);
  const [rejecting, setRejecting] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<
    FieldErrors<keyof Draft | "reviewNote" | "schedule">
  >({});
  const [busy, setBusy] = React.useState(false);
  const [device, setDevice] = React.useState<PreviewDevice>("desktop");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createDirty, setCreateDirty] = React.useState(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    void Promise.all([listBannerTemplates(false), listOffers(), getAdminProperties()]).then(
      ([templateResult, offerResult, propertyResult]) => {
        if (templateResult.ok) setTemplates(templateResult.data);
        if (offerResult.ok) setOffers(offerResult.data);
        if (propertyResult.ok) setProperties(propertyResult.data);
      },
    );
  }, []);

  const filtered = React.useMemo(() => filterBanners(items, filters), [filters, items]);
  const bannersPage = useFilteredPage(filtered, filters);
  const canEdit = Boolean(active && !isAdmin && EDITABLE.has(active.status));
  const dirty = Boolean(canEdit && active && draft && JSON.stringify(draft) !== JSON.stringify(toDraft(active)));

  const columns = React.useMemo<readonly DataColumn<Banner>[]>(
    () => [
      {
        key: "banner",
        header: "Banner",
        render: (banner) => (
          <DataTablePrimaryCell
            title={banner.title}
            subtitle={banner.category_key?.replaceAll("-", " ") ?? banner.banner_type}
          />
        ),
      },
      {
        key: "placement",
        header: "Placement",
        render: (banner) => (
          <span className="capitalize">{banner.placement.replaceAll("_", " ")}</span>
        ),
      },
      {
        key: "line",
        header: "Line",
        render: (banner) => banner.business_line === "both" ? "Both lines" : banner.business_line === "real_estate" ? "Real Estate" : "Loans",
      },
      { key: "priority", header: "Priority", align: "right", render: (banner) => banner.priority },
      {
        key: "updated",
        header: "Updated",
        render: (banner) => new Date(banner.updated_at).toLocaleDateString("en-IN"),
      },
      {
        key: "state",
        header: "State",
        render: (banner) => (
          <StatusBadge tone={STATUS_TONE[banner.status]}>{STATUS_LABEL[banner.status]}</StatusBadge>
        ),
      },
    ],
    [],
  );

  const selectedTemplate = templates.find((template) => template.id === draft?.templateId);
  const selectedOffer = offers.find((offer) => offer.id === draft?.offerId);
  const selectedProperty = properties.find((property) => property.id === draft?.propertyId);
  const categoryNeedsOffer = selectedTemplate?.category_key === "offers";
  const categoryAllowsProperty = isPropertyCampaignTemplate(selectedTemplate);
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
  const editableProperties = selectedTemplate
    ? properties.filter((property) => propertyMatchesCampaign(property, selectedTemplate))
    : [];
  const propertyOptions =
    selectedProperty && !editableProperties.some((property) => property.id === selectedProperty.id)
      ? [selectedProperty, ...editableProperties]
      : editableProperties;

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
    setFieldErrors({});
  }

  async function save(banner: Banner) {
    if (!draft) return;
    const errors: FieldErrors<keyof Draft | "reviewNote" | "schedule"> = {
      title: requiredTextError(draft.title, "Title", 500),
      subtitle: optionalTextError(draft.subtitle, "Subtitle", 300),
      ctaLabel: optionalTextError(draft.ctaLabel, "Button label", 40),
      deepLink:
        draft.deepLink.trim() && !isSafeLocalHref(draft.deepLink.trim())
          ? "Use a same-site path beginning with one slash."
          : optionalTextError(draft.deepLink, "Internal destination", 1000),
      priority: integerError(draft.priority, "Priority", {
        required: true,
        min: 0,
        max: 2_147_483_647,
      }),
      templateId:
        banner.placement !== "dashboard" && !draft.templateId
          ? "Artwork template is required."
          : undefined,
      offerId: categoryNeedsOffer && !draft.offerId ? "Linked Offer is required." : undefined,
    };
    if (
      (draft.startsAt && Number.isNaN(new Date(draft.startsAt).getTime())) ||
      (draft.endsAt && Number.isNaN(new Date(draft.endsAt).getTime())) ||
      (draft.startsAt && draft.endsAt && new Date(draft.endsAt) <= new Date(draft.startsAt))
    ) {
      errors.schedule = "The archive time must be a valid date after the go-live time.";
    }
    const nextErrors = Object.fromEntries(
      Object.entries(errors).filter(([, validationError]) => validationError),
    ) as typeof fieldErrors;
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      requestAnimationFrame(() => {
        if (dialogRef.current) focusFirstInvalidField(dialogRef.current);
      });
      return;
    }
    setBusy(true);
    const result = await updateBanner(banner.id, {
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim() || null,
      cta_label: draft.ctaLabel.trim() || null,
      deep_link: draft.propertyId ? null : draft.deepLink.trim() || null,
      template_id: banner.placement === "dashboard" ? null : draft.templateId,
      offer_id: categoryNeedsOffer ? draft.offerId : null,
      property_id: categoryAllowsProperty && draft.propertyId ? draft.propertyId : null,
      priority: Number(draft.priority) || 0,
      starts_at: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
      ends_at: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
    });
    setBusy(false);
    if (!result.ok) {
      const serverErrors = apiIssuesToFieldErrors(result.issues, {
        title: "title",
        subtitle: "subtitle",
        cta_label: "ctaLabel",
        deep_link: "deepLink",
        template_id: "templateId",
        offer_id: "offerId",
        property_id: "propertyId",
        priority: "priority",
        starts_at: "schedule",
        ends_at: "schedule",
      });
      if (Object.keys(serverErrors).length > 0) setFieldErrors(serverErrors);
      return void toast.error("Could not update banner", { description: result.error });
    }
    toast.success("Banner updated");
    setActive(result.data);
    setDraft(toDraft(result.data));
    setFieldErrors({});
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
    const validationError = requiredTextError(note, "Rejection reason", 1000);
    setFieldErrors((current) => ({ ...current, reviewNote: validationError }));
    if (validationError) {
      requestAnimationFrame(() => {
        if (dialogRef.current) focusFirstInvalidField(dialogRef.current);
      });
      return;
    }
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
      <FilterBar
        value={filters}
        onChange={setFilters}
        searchLabel="Search banners"
        searchPlaceholder="Title or subtitle"
        statusOptions={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
        statusLabel="banner states"
        kindLabel="banner types"
        kindOptions={[
          { value: "default", label: "Default" },
          { value: "action", label: "Action" },
          { value: "personalized", label: "Personalized" },
        ]}
        note="Filters apply to the records already loaded for your authorized role."
      />
      {error ? (
        <FetchError status={null} message={error} onRetry={() => void reload()} />
      ) : (
        <DashboardPanel
          title="Campaign library"
          description={`${filtered.length} ${filtered.length === 1 ? "banner" : "banners"} shown.`}
          bodyClassName="p-0"
        >
          {loading ? (
            <div className="p-5"><ListLoadingState rows={5} /></div>
          ) : filtered.length === 0 ? (
            <ListEmptyState
              icon={Inbox}
              title={items.length ? "No banners match these filters" : "No banners yet"}
              description={items.length ? "Clear or adjust the filters." : "Create the first banner draft to get started."}
              className="m-5"
            />
          ) : (
            <>
              <DataTable
                columns={columns}
                rows={bannersPage.pageRows}
                rowKey={(banner) => banner.id}
                onRowClick={openBanner}
                rowActionLabel="Open banner workspace"
                minWidth="min-w-[900px]"
              />
              <div className="px-5 pb-5">
                <ListPagination page={bannersPage.page} total={bannersPage.total} onPageChange={bannersPage.setPage} />
              </div>
            </>
          )}
        </DashboardPanel>
      )}

      <Dialog open={active !== null} onOpenChange={closeWorkspace}>
        <DialogContent ref={dialogRef} showCloseButton={false} className={CMS_WORKSPACE_DIALOG_CLASS}>
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
                        <Label htmlFor="banner-title">Title <RequiredIndicator /></Label>
                        <Input id="banner-title" value={draft.title} disabled={!canEdit} maxLength={500} onChange={(event) => { setDraft({ ...draft, title: event.target.value }); setFieldErrors((current) => ({ ...current, title: undefined })); }} aria-invalid={Boolean(fieldErrors.title)} aria-describedby={fieldErrors.title ? "banner-edit-title-error" : undefined} />
                        <FieldError id="banner-edit-title-error">{fieldErrors.title}</FieldError>
                      </div>
                      <div>
                        <Label htmlFor="banner-subtitle">Subtitle</Label>
                        <Input id="banner-subtitle" value={draft.subtitle} disabled={!canEdit} maxLength={300} onChange={(event) => { setDraft({ ...draft, subtitle: event.target.value }); setFieldErrors((current) => ({ ...current, subtitle: undefined })); }} aria-invalid={Boolean(fieldErrors.subtitle)} aria-describedby={fieldErrors.subtitle ? "banner-edit-subtitle-error" : undefined} />
                        <FieldError id="banner-edit-subtitle-error">{fieldErrors.subtitle}</FieldError>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <Label htmlFor="banner-cta">Button label</Label>
                          <Input id="banner-cta" value={draft.ctaLabel} disabled={!canEdit} maxLength={40} onChange={(event) => { setDraft({ ...draft, ctaLabel: event.target.value }); setFieldErrors((current) => ({ ...current, ctaLabel: undefined })); }} aria-invalid={Boolean(fieldErrors.ctaLabel)} aria-describedby={fieldErrors.ctaLabel ? "banner-edit-cta-error" : undefined} />
                          <FieldError id="banner-edit-cta-error">{fieldErrors.ctaLabel}</FieldError>
                        </div>
                        <div>
                          <Label htmlFor="banner-link">Internal destination</Label>
                          <Input
                            id="banner-link"
                            value={selectedProperty ? propertyCampaignHref(selectedProperty) : draft.deepLink}
                            disabled={!canEdit || Boolean(selectedProperty)}
                            maxLength={1000}
                            onChange={(event) => { setDraft({ ...draft, deepLink: event.target.value }); setFieldErrors((current) => ({ ...current, deepLink: undefined })); }}
                            aria-invalid={Boolean(fieldErrors.deepLink)}
                            aria-describedby={fieldErrors.deepLink ? "banner-edit-link-error" : undefined}
                          />
                          <FieldError id="banner-edit-link-error">{fieldErrors.deepLink}</FieldError>
                        </div>
                      </div>
                      {active.placement !== "dashboard" ? (
                        <div>
                          <Label htmlFor="edit-template">Artwork template <RequiredIndicator /></Label>
                          <Select value={draft.templateId || undefined} disabled={!canEdit} onValueChange={(templateId) => { setDraft({ ...draft, templateId, offerId: "", propertyId: "" }); setFieldErrors((current) => ({ ...current, templateId: undefined })); }}>
                            <SelectTrigger id="edit-template" aria-required="true" aria-invalid={Boolean(fieldErrors.templateId)} aria-describedby={fieldErrors.templateId ? "banner-edit-template-error" : undefined}><SelectValue placeholder="Choose a template" /></SelectTrigger>
                            <SelectContent>
                              {editableTemplates.map((template) => (
                                <SelectItem key={template.id} value={template.id}>{template.label} · version {template.version}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FieldError id="banner-edit-template-error">{fieldErrors.templateId}</FieldError>
                        </div>
                      ) : null}
                      {categoryNeedsOffer ? (
                        <div>
                          <Label htmlFor="edit-offer">Linked Offer <RequiredIndicator /></Label>
                          <Select value={draft.offerId || undefined} disabled={!canEdit} onValueChange={(offerId) => { setDraft({ ...draft, offerId }); setFieldErrors((current) => ({ ...current, offerId: undefined })); }}>
                            <SelectTrigger id="edit-offer" aria-required="true" aria-invalid={Boolean(fieldErrors.offerId)} aria-describedby={fieldErrors.offerId ? "banner-edit-offer-error" : undefined}><SelectValue placeholder="Choose an Offer" /></SelectTrigger>
                            <SelectContent>
                              {editableOffers.map((offer) => <SelectItem key={offer.id} value={offer.id}>{offer.title}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <FieldError id="banner-edit-offer-error">{fieldErrors.offerId}</FieldError>
                        </div>
                      ) : null}
                      {categoryAllowsProperty ? (
                        <div>
                          <Label htmlFor="edit-property">Advertised property (optional)</Label>
                          <PropertyCampaignSelect
                            id="edit-property"
                            properties={propertyOptions}
                            value={draft.propertyId}
                            onChange={(propertyId) => setDraft({ ...draft, propertyId })}
                            disabled={!canEdit}
                          />
                          <p className="mt-1 text-xs text-text-secondary">
                            Property cover art, enquiry destination, and RERA verification are server-controlled.
                          </p>
                        </div>
                      ) : null}
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div>
                          <Label htmlFor="banner-priority">Priority</Label>
                          <Input id="banner-priority" inputMode="numeric" value={draft.priority} disabled={!canEdit} onChange={(event) => { setDraft({ ...draft, priority: event.target.value.replace(/\D/g, "") }); setFieldErrors((current) => ({ ...current, priority: undefined })); }} aria-invalid={Boolean(fieldErrors.priority)} aria-describedby={fieldErrors.priority ? "banner-edit-priority-error" : undefined} />
                          <FieldError id="banner-edit-priority-error">{fieldErrors.priority}</FieldError>
                        </div>
                        <div>
                          <Label htmlFor="banner-start">Goes live at</Label>
                          <Input id="banner-start" type="datetime-local" value={draft.startsAt} disabled={!canEdit} onChange={(event) => { setDraft({ ...draft, startsAt: event.target.value }); setFieldErrors((current) => ({ ...current, schedule: undefined })); }} aria-invalid={Boolean(fieldErrors.schedule)} aria-describedby={fieldErrors.schedule ? "banner-edit-schedule-error" : undefined} />
                        </div>
                        <div>
                          <Label htmlFor="banner-end">Archives at</Label>
                          <Input id="banner-end" type="datetime-local" value={draft.endsAt} disabled={!canEdit} onChange={(event) => { setDraft({ ...draft, endsAt: event.target.value }); setFieldErrors((current) => ({ ...current, schedule: undefined })); }} aria-invalid={Boolean(fieldErrors.schedule)} aria-describedby={fieldErrors.schedule ? "banner-edit-schedule-error" : undefined} />
                        </div>
                      </div>
                      <FieldError id="banner-edit-schedule-error">{fieldErrors.schedule}</FieldError>
                      {active.review_note ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">Review note: {active.review_note}</p> : null}
                      {rejecting ? <div><Textarea aria-label="Reason for rejection" value={note} maxLength={1000} onChange={(event) => { setNote(event.target.value); setFieldErrors((current) => ({ ...current, reviewNote: undefined })); }} placeholder="Reason for rejection" aria-invalid={Boolean(fieldErrors.reviewNote)} aria-describedby={fieldErrors.reviewNote ? "banner-review-note-error" : undefined} /><FieldError id="banner-review-note-error">{fieldErrors.reviewNote}</FieldError></div> : null}
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
                      placement={active.placement}
                      banner={{
                        banner_type: active.banner_type,
                        title: draft.title,
                        subtitle: draft.subtitle || null,
                        cta_label: selectedProperty ? draft.ctaLabel || "Enquire now" : draft.ctaLabel || null,
                        deep_link: selectedProperty ? propertyCampaignHref(selectedProperty) : draft.deepLink || null,
                        image_url:
                          propertyCampaignImage(selectedProperty, selectedTemplate) ??
                          selectedTemplate?.image_url,
                        offer_badge: formatOfferBadge(selectedOffer),
                        rera_verified: selectedProperty?.rera_verification_status === "verified",
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
