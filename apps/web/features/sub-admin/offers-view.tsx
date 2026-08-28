"use client";

import * as React from "react";
import { Archive, CalendarClock, Inbox, Plus, Zap } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  apiIssuesToFieldErrors,
  focusFirstInvalidField,
  optionalTextError,
  requiredTextError,
  type FieldErrors,
} from "@/lib/form-validation";
import { activateOffer, archiveOffer, scheduleOffer, updateOffer, type Offer } from "@/lib/offers-api";

import { audienceSummary } from "./audience-rule-fields";
import { filterOffers } from "./cms-filters";
import { OfferPreview } from "./cms-previews";
import {
  CmsPreviewFrame,
  CmsWorkspaceHeader,
  CmsWorkspaceLayout,
  CMS_WORKSPACE_DIALOG_CLASS,
  type PreviewDevice,
} from "./cms-workspace";
import { OfferForm } from "./offer-form";
import { useOfferQueue } from "./use-offer-queue";

const STATUS_LABEL: Record<Offer["status"], string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  active: "Active",
  expired: "Expired",
  archived: "Archived",
};
const STATUS_TONE: Record<Offer["status"], StatusTone> = {
  draft: "neutral",
  scheduled: "warning",
  active: "success",
  expired: "danger",
  archived: "neutral",
};
const EDITABLE = new Set<Offer["status"]>(["draft", "scheduled"]);
const KIND_OPTIONS = [
  { value: "percentage", label: "Percentage" },
  { value: "flat", label: "Flat amount" },
  { value: "cashback-tie", label: "Cashback tie-in" },
];

type OfferEditField = "title" | "description" | "code";

function discountText(offer: Offer): string {
  return offer.discount_type === "percentage"
    ? `${offer.discount_value}% off`
    : offer.discount_type === "cashback-tie"
      ? "Cashback offer"
      : `₹${offer.discount_value} off`;
}

export function OffersView() {
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";
  const { items, loading, error, reload } = useOfferQueue();
  const [filters, setFilters] = React.useState<FilterBarValue>(EMPTY_FILTERS);
  const filtered = React.useMemo(() => filterOffers(items, filters), [filters, items]);
  const offersPage = useFilteredPage(filtered, filters);
  const [active, setActive] = React.useState<Offer | null>(null);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [code, setCode] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors<OfferEditField>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [previewContext, setPreviewContext] = React.useState("public");
  const [device, setDevice] = React.useState<PreviewDevice>("desktop");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createDirty, setCreateDirty] = React.useState(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const canEdit = Boolean(active && !isAdmin && EDITABLE.has(active.status));
  const dirty = Boolean(
    active &&
      canEdit &&
      (title !== active.title ||
        description !== (active.description ?? "") ||
        code !== (active.code ?? "")),
  );

  const columns = React.useMemo<readonly DataColumn<Offer>[]>(
    () => [
      {
        key: "offer",
        header: "Offer",
        render: (item) => (
          <DataTablePrimaryCell title={item.title} subtitle={audienceSummary(item.audience_rules)} />
        ),
      },
      { key: "discount", header: "Discount", render: discountText },
      {
        key: "line",
        header: "Line",
        render: (item) => item.business_line === "both" ? "Both lines" : item.business_line === "real_estate" ? "Real Estate" : "Loans",
      },
      {
        key: "starts",
        header: "Starts",
        render: (item) => item.starts_at ? new Date(item.starts_at).toLocaleDateString("en-IN") : "On activation",
      },
      {
        key: "state",
        header: "State",
        render: (item) => (
          <StatusBadge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</StatusBadge>
        ),
      },
    ],
    [],
  );

  function closeWorkspace(openState: boolean) {
    if (openState || busy) return;
    if (dirty && !window.confirm("Discard unsaved offer changes?")) return;
    setActive(null);
  }

  function closeCreate(openState: boolean) {
    if (openState) return setCreateOpen(true);
    if (createDirty && !window.confirm("Discard this offer draft?")) return;
    setCreateOpen(false);
    setCreateDirty(false);
  }

  function open(item: Offer) {
    setActive(item);
    setTitle(item.title);
    setDescription(item.description ?? "");
    setCode(item.code ?? "");
    setFieldErrors({});
    setFormError(null);
  }

  function showErrors(errors: FieldErrors<OfferEditField>) {
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      requestAnimationFrame(() => {
        if (dialogRef.current) focusFirstInvalidField(dialogRef.current);
      });
    }
  }

  async function save(item: Offer) {
    const errors = {
      title: requiredTextError(title, "Title", 500),
      description: optionalTextError(description, "Description", 2000),
      code: optionalTextError(code, "Promo code", 100),
    };
    const nextErrors = Object.fromEntries(
      Object.entries(errors).filter(([, validationError]) => validationError),
    ) as FieldErrors<OfferEditField>;
    showErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    const result = await updateOffer(item.id, {
      title: title.trim(),
      description: description.trim() || null,
      code: code.trim() || null,
    });
    setBusy(false);
    if (!result.ok) {
      showErrors(
        apiIssuesToFieldErrors(result.issues, {
          title: "title",
          description: "description",
          code: "code",
        }),
      );
      setFormError(result.error);
      toast.error("Could not update offer", { description: result.error });
      return;
    }
    toast.success("Offer updated");
    setActive(result.data);
    setFieldErrors({});
    void reload();
  }

  async function advance(action: typeof scheduleOffer, item: Offer, message: string) {
    setBusy(true);
    const result = await action(item.id);
    setBusy(false);
    if (result.ok) {
      toast.success(message);
      setActive(null);
      void reload();
    } else toast.error("Could not update offer", { description: result.error });
  }

  return (
    <DashboardPage>
      <DashboardHeader title="Offers" description={isAdmin ? "Review promotion audiences, schedules, and lifecycle state." : "Create, schedule, preview, and retire customer promotions."} actions={isAdmin ? undefined : <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />New offer</Button>} />
      <MetricGrid>
        <MetricCard label="Total offers" value={items.length} icon={DASHBOARD_ICONS.offers} />
        <MetricCard label="Drafts" value={items.filter((item) => item.status === "draft").length} icon={DASHBOARD_ICONS.websiteContent} />
        <MetricCard label="Scheduled" value={items.filter((item) => item.status === "scheduled").length} icon={CalendarClock} />
        <MetricCard label="Active" value={items.filter((item) => item.status === "active").length} icon={DASHBOARD_ICONS.analytics} />
      </MetricGrid>
      <FilterBar
        value={filters}
        onChange={setFilters}
        searchLabel="Search offers"
        searchPlaceholder="Title, description, or code"
        statusOptions={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
        statusLabel="offer states"
        kindLabel="discount types"
        kindOptions={KIND_OPTIONS}
        note="Filters apply to the records already loaded for your authorized role."
      />
      {error ? (
        <FetchError status={null} message={error} onRetry={() => void reload()} />
      ) : (
        <DashboardPanel
          title="Promotion library"
          description={`${filtered.length} ${filtered.length === 1 ? "offer" : "offers"} shown.`}
          bodyClassName="p-0"
        >
          {loading ? (
            <div className="p-5"><ListLoadingState rows={5} /></div>
          ) : filtered.length === 0 ? (
            <ListEmptyState
              icon={Inbox}
              title={items.length ? "No offers match these filters" : "No offers yet"}
              description={items.length ? "Clear or adjust the filters." : "Create the first offer to get started."}
              className="m-5"
            />
          ) : (
            <>
              <DataTable columns={columns} rows={offersPage.pageRows} rowKey={(item) => item.id} onRowClick={open} rowActionLabel="Open offer workspace" minWidth="min-w-[820px]" />
              <div className="px-5 pb-5"><ListPagination page={offersPage.page} total={offersPage.total} onPageChange={offersPage.setPage} /></div>
            </>
          )}
        </DashboardPanel>
      )}

      <Dialog open={active !== null} onOpenChange={closeWorkspace}>
        <DialogContent ref={dialogRef} showCloseButton={false} className={CMS_WORKSPACE_DIALOG_CLASS}>
          {active ? <>
            <CmsWorkspaceHeader title={active.title} description={`${STATUS_LABEL[active.status]} · ${active.business_line === "both" ? "Both lines" : active.business_line} · ${discountText(active)}`} />
            <CmsWorkspaceLayout
              editor={<div className="space-y-5"><section className="space-y-4 rounded-xl border border-border p-4">
                <div><Label htmlFor="offer-title">Title <RequiredIndicator /></Label><Input id="offer-title" value={canEdit ? title : active.title} disabled={!canEdit} maxLength={500} onChange={(event) => { setTitle(event.target.value); setFieldErrors((current) => ({ ...current, title: undefined })); }} aria-invalid={Boolean(fieldErrors.title)} aria-describedby={fieldErrors.title ? "offer-edit-title-error" : undefined} /><FieldError id="offer-edit-title-error">{fieldErrors.title}</FieldError></div>
                <div><Label htmlFor="offer-description">Description</Label><Input id="offer-description" value={canEdit ? description : active.description ?? ""} disabled={!canEdit} maxLength={2000} onChange={(event) => { setDescription(event.target.value); setFieldErrors((current) => ({ ...current, description: undefined })); }} aria-invalid={Boolean(fieldErrors.description)} aria-describedby={fieldErrors.description ? "offer-edit-description-error" : undefined} /><FieldError id="offer-edit-description-error">{fieldErrors.description}</FieldError></div>
                <div><Label htmlFor="offer-code">Promo code</Label><Input id="offer-code" value={canEdit ? code : active.code ?? ""} disabled={!canEdit} maxLength={100} onChange={(event) => { setCode(event.target.value); setFieldErrors((current) => ({ ...current, code: undefined })); }} aria-invalid={Boolean(fieldErrors.code)} aria-describedby={fieldErrors.code ? "offer-edit-code-error" : undefined} /><FieldError id="offer-edit-code-error">{fieldErrors.code}</FieldError></div>
                {formError ? <p className="text-sm text-destructive" role="alert">{formError}</p> : null}
                <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-text-secondary">Audience</dt><dd className="font-medium">{audienceSummary(active.audience_rules)}</dd></div><div><dt className="text-text-secondary">Priority</dt><dd className="font-medium">{active.priority}</dd></div><div><dt className="text-text-secondary">Goes live</dt><dd className="font-medium">{active.starts_at ? new Date(active.starts_at).toLocaleString("en-IN") : "When activated"}</dd></div><div><dt className="text-text-secondary">Expires</dt><dd className="font-medium">{active.ends_at ? new Date(active.ends_at).toLocaleString("en-IN") : "No automatic end"}</dd></div></dl>
              </section><DialogFooter>{canEdit ? <Button variant="outline" disabled={busy} onClick={() => void save(active)}>Save changes</Button> : null}{!isAdmin && active.status === "draft" ? <Button disabled={busy} onClick={() => void advance(scheduleOffer, active, "Offer scheduled")}><CalendarClock className="h-4 w-4" />Schedule</Button> : null}{!isAdmin && active.status === "scheduled" ? <><Button variant="outline" disabled={busy} onClick={() => void advance(archiveOffer, active, "Offer archived")}><Archive className="h-4 w-4" />Archive</Button><Button disabled={busy} onClick={() => void advance(activateOffer, active, "Offer activated")}><Zap className="h-4 w-4" />Activate</Button></> : null}{!isAdmin && active.status === "active" ? <Button variant="outline" disabled={busy} onClick={() => void advance(archiveOffer, active, "Offer archived")}><Archive className="h-4 w-4" />Archive</Button> : null}</DialogFooter></div>}
              preview={<CmsPreviewFrame title="Offer appearance" description="Compare its public line-page card with the personalized dashboard card." contexts={[{ value: "public", label: "Public page" }, { value: "dashboard", label: "Dashboard" }]} context={previewContext} onContextChange={setPreviewContext} device={device} onDeviceChange={setDevice}><OfferPreview context={previewContext as "public" | "dashboard"} offer={{ ...active, title: canEdit ? title : active.title, description: canEdit ? description : active.description, code: canEdit ? code : active.code }} /></CmsPreviewFrame>}
            />
          </> : null}
        </DialogContent>
      </Dialog>

      {isAdmin ? null : <Dialog open={createOpen} onOpenChange={closeCreate}><DialogContent showCloseButton={false} className={CMS_WORKSPACE_DIALOG_CLASS}><CmsWorkspaceHeader title="New offer" description="Create and preview a promotion before scheduling it." /><div className="min-h-0 overflow-y-auto py-2"><OfferForm embedded onDirtyChange={setCreateDirty} onCreated={() => { setCreateDirty(false); setCreateOpen(false); void reload(); }} /></div></DialogContent></Dialog>}
    </DashboardPage>
  );
}
