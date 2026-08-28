"use client";

import * as React from "react";
import { ImageIcon, Landmark, Loader2, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardPanel } from "@/features/dashboard/dashboard-ui";
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
  matchesSearch,
  type FilterBarValue,
} from "@/features/dashboard/filter-bar";
import { ListEmptyState, ListLoadingState, ListPagination } from "@/features/dashboard/list-states";
import { StatusBadge } from "@/features/dashboard/status-badge";
import { useFilteredPage } from "@/features/dashboard/use-filtered-page";
import {
  createBank,
  deleteBank,
  updateBank,
  uploadProviderLogo,
  type AdminBank,
  type ProviderType,
} from "@/lib/loan-config-api";
import { isAllowedAssetUrl } from "@/lib/allowed-asset-url";
import { formatLastUpdated } from "@/lib/format";
import { apiIssuesToFieldErrors, requiredTextError } from "@/lib/form-validation";
import { useBanks } from "./use-banks";

const PROVIDER_TYPE_OPTIONS = [
  { value: "bank", label: "Banks" },
  { value: "small_finance_bank", label: "Small finance banks" },
  { value: "nbfc", label: "NBFCs" },
  { value: "hfc", label: "Housing finance companies" },
  { value: "fintech", label: "Fintechs" },
  { value: "other", label: "Other providers" },
] as const;

const PROVIDER_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "disabled", label: "Disabled" },
  { value: "verified_logo", label: "Verified logo" },
  { value: "missing_logo", label: "Missing verified logo" },
] as const;

export function BanksView() {
  const { items, loading, error, reload } = useBanks();
  const [active, setActive] = React.useState<AdminBank | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<AdminBank | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newLegalName, setNewLegalName] = React.useState("");
  const [newProviderType, setNewProviderType] = React.useState<ProviderType>("bank");
  const [draftName, setDraftName] = React.useState("");
  const [draftLegalName, setDraftLegalName] = React.useState("");
  const [draftProviderType, setDraftProviderType] = React.useState<ProviderType>("bank");
  const [draftActive, setDraftActive] = React.useState(true);
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [logoSource, setLogoSource] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [createErrors, setCreateErrors] = React.useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = React.useState<Record<string, string>>({});
  const [filters, setFilters] = React.useState<FilterBarValue>(EMPTY_FILTERS);
  const [sort, setSort] = React.useState<SortState>({ key: "name", dir: "asc" });

  const filteredProviders = React.useMemo(() => {
    const rows = items.filter((provider) => {
      if (
        filters.search &&
        !matchesSearch(
          `${provider.name} ${provider.legal_name ?? ""} ${provider.provider_type}`,
          filters.search,
        )
      ) {
        return false;
      }
      if (filters.kind !== "all" && provider.provider_type !== filters.kind) return false;
      if (filters.status === "active" && !provider.active) return false;
      if (filters.status === "disabled" && provider.active) return false;
      if (filters.status === "verified_logo" && provider.logo_verified_at == null) return false;
      if (filters.status === "missing_logo" && provider.logo_verified_at != null) return false;
      return true;
    });
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => {
      const result =
        sort.key === "type"
          ? left.provider_type.localeCompare(right.provider_type)
          : sort.key === "usage"
            ? left.application_count + left.offer_count - (right.application_count + right.offer_count)
            : sort.key === "state"
              ? Number(left.active) - Number(right.active)
              : left.name.localeCompare(right.name);
      return result * direction || left.name.localeCompare(right.name);
    });
  }, [filters, items, sort]);
  const page = useFilteredPage(filteredProviders, [filters, sort]);

  const columns = React.useMemo<readonly DataColumn<AdminBank>[]>(
    () => [
      {
        key: "name",
        header: "Provider",
        sortable: true,
        render: (provider) => (
          <div className="flex items-center gap-3">
            <span className="relative flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
              {provider.logo_url && isAllowedAssetUrl(provider.logo_url) ? (
                <Image src={provider.logo_url} alt="" fill sizes="64px" className="object-contain p-1" />
              ) : (
                <ImageIcon className="h-4 w-4 text-text-secondary" aria-hidden="true" />
              )}
            </span>
            <DataTablePrimaryCell
              title={provider.name}
              subtitle={provider.legal_name || formatLastUpdated(provider.updated_at)}
            />
          </div>
        ),
      },
      {
        key: "type",
        header: "Type",
        sortable: true,
        render: (provider) => provider.provider_type.replaceAll("_", " "),
      },
      {
        key: "logo",
        header: "Logo",
        render: (provider) => (
          <StatusBadge tone={provider.logo_verified_at ? "success" : "neutral"}>
            {provider.logo_verified_at ? "Verified" : "Initials fallback"}
          </StatusBadge>
        ),
      },
      {
        key: "usage",
        header: "Usage",
        sortable: true,
        align: "right",
        render: (provider) => (
          <span className="whitespace-nowrap tabular-nums">
            {provider.application_count} apps · {provider.offer_count} offers
          </span>
        ),
      },
      {
        key: "state",
        header: "State",
        sortable: true,
        render: (provider) => (
          <StatusBadge tone={provider.active ? "success" : "neutral"}>
            {provider.active ? "Active" : "Disabled"}
          </StatusBadge>
        ),
      },
    ],
    [],
  );

  function openEdit(bank: AdminBank) {
    setActive(bank);
    setDraftName(bank.name);
    setDraftLegalName(bank.legal_name ?? "");
    setDraftProviderType(bank.provider_type);
    setDraftActive(bank.active);
    setLogoFile(null);
    setLogoSource("");
    setEditErrors({});
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const nameError = requiredTextError(newName, "Display name", 200);
    if (nameError) {
      setCreateErrors({ name: nameError });
      return;
    }
    setBusy(true);
    const res = await createBank({
      name: newName.trim(),
      legal_name: newLegalName.trim() || null,
      provider_type: newProviderType,
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Provider added");
      setNewName("");
      setNewLegalName("");
      setNewProviderType("bank");
      setCreating(false);
      void reload();
    } else {
      const serverErrors = apiIssuesToFieldErrors(res.issues, {
        name: "name",
        legal_name: "legalName",
        provider_type: "providerType",
      });
      if (Object.keys(serverErrors).length > 0) setCreateErrors(serverErrors);
      toast.error("Couldn't add bank", { description: res.error });
    }
  }

  async function onSaveEdit() {
    if (!active) return;
    const nameError = requiredTextError(draftName, "Display name", 200);
    if (nameError) {
      setEditErrors({ name: nameError });
      return;
    }
    const nameChanged = draftName.trim() !== active.name;
    const legalName = draftLegalName.trim() || null;
    const legalNameChanged = legalName !== active.legal_name;
    const providerTypeChanged = draftProviderType !== active.provider_type;
    const activeChanged = draftActive !== active.active;
    const detailsChanged = nameChanged || legalNameChanged || providerTypeChanged || activeChanged;
    if (!nameChanged && !legalNameChanged && !providerTypeChanged && !activeChanged && !logoFile) {
      setActive(null);
      return;
    }
    if (logoFile && logoSource.trim().length < 3) {
      setEditErrors({ logoSource: "Add the official or licensed source for this logo." });
      return;
    }
    setBusy(true);
    if (detailsChanged) {
      const res = await updateBank(active.id, {
        name: nameChanged ? draftName.trim() : undefined,
        legal_name: legalNameChanged ? legalName : undefined,
        provider_type: providerTypeChanged ? draftProviderType : undefined,
        active: activeChanged ? draftActive : undefined,
      });
      if (!res.ok) {
        setBusy(false);
        const serverErrors = apiIssuesToFieldErrors(res.issues, {
          name: "name",
          legal_name: "legalName",
          provider_type: "providerType",
        });
        if (Object.keys(serverErrors).length > 0) setEditErrors(serverErrors);
        toast.error("Couldn't update provider", { description: res.error });
        return;
      }
    }
    const logoResult = logoFile
      ? await uploadProviderLogo(active.id, logoFile, logoSource.trim())
      : null;
    setBusy(false);
    if (!logoResult || logoResult.ok) {
      toast.success("Provider updated");
      setActive(null);
      void reload();
    } else {
      setEditErrors({ logo: logoResult.error });
      toast.error("Provider details saved, but the logo was not updated", {
        description: logoResult.error,
      });
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    const response = await deleteBank(deleteTarget.id);
    setBusy(false);
    if (response.ok) {
      toast.success("Provider deleted");
      setDeleteTarget(null);
      void reload();
    } else {
      toast.error("Couldn't delete provider", { description: response.error });
      setDeleteTarget(null);
      void reload();
    }
  }

  return (
    <div className="space-y-4">
      <FilterBar
        value={filters}
        onChange={setFilters}
        searchLabel="Search provider library"
        searchPlaceholder="Provider, legal name, or type"
        statusOptions={PROVIDER_STATUS_OPTIONS}
        statusLabel="states"
        kindOptions={PROVIDER_TYPE_OPTIONS}
        kindLabel="Provider types"
        showLine={false}
        showDates={false}
        note="Raster uploads only. Every logo keeps its official or licensed provenance."
      />

      <DashboardPanel
        title="Providers & logos"
        description="Reusable identities for operational assignment and explicit public product offers."
        action={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New provider
          </Button>
        }
        bodyClassName="p-0"
      >
        {loading ? (
          <div className="p-5">
            <ListLoadingState rows={7} />
          </div>
        ) : error ? (
          <div className="p-5">
            <FetchError status={null} message={error} onRetry={() => void reload()} />
          </div>
        ) : filteredProviders.length === 0 ? (
          <ListEmptyState
            icon={Landmark}
            title={items.length === 0 ? "No providers yet" : "No providers match these filters"}
            description={
              items.length === 0
                ? "Add the first provider to build the reusable identity and logo library."
                : "Clear or adjust the filters to return to the provider library."
            }
            className="m-5"
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={page.pageRows}
              rowKey={(provider) => provider.id}
              sort={sort}
              onSortChange={(key) => setSort((current) => nextSort(current, key))}
              onRowClick={openEdit}
              rowActionLabel="Edit provider"
              minWidth="min-w-[860px]"
            />
            <div className="px-5 pb-5">
              <ListPagination page={page.page} total={page.total} onPageChange={page.setPage} />
            </div>
          </>
        )}
      </DashboardPanel>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New provider</DialogTitle>
            <DialogDescription>
              It becomes reusable across public offers and the staff lender picker.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => void onCreate(e)}>
            <div>
                <Label htmlFor="new-bank-name">Display name<RequiredIndicator /></Label>
              <Input
                id="new-bank-name"
                value={newName}
                onChange={(ev) => { setNewName(ev.target.value); setCreateErrors((current) => { const next = { ...current }; delete next.name; return next; }); }}
                placeholder="Enter provider name"
                maxLength={200}
                aria-invalid={Boolean(createErrors.name)}
                aria-describedby={createErrors.name ? "new-bank-name-error" : undefined}
              />
              <FieldError id="new-bank-name-error" className="mt-1">{createErrors.name}</FieldError>
            </div>
            <div>
              <Label htmlFor="new-bank-legal-name">Legal name (optional)</Label>
              <Input
                id="new-bank-legal-name"
                value={newLegalName}
                onChange={(event) => setNewLegalName(event.target.value)}
                maxLength={200}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-provider-type">Provider type</Label>
              <Select value={newProviderType} onValueChange={(value: ProviderType) => setNewProviderType(value)}>
                <SelectTrigger id="new-provider-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="small_finance_bank">Small finance bank</SelectItem>
                  <SelectItem value="nbfc">NBFC</SelectItem>
                  <SelectItem value="hfc">Housing finance company</SelectItem>
                  <SelectItem value="fintech">Fintech</SelectItem>
                  <SelectItem value="other">Other provider</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Add provider
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-xl">
          {active ? (
            <>
              <DialogHeader>
                <DialogTitle>Edit provider</DialogTitle>
                <DialogDescription>{formatLastUpdated(active.updated_at)}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="edit-bank-name">Display name<RequiredIndicator /></Label>
                  <Input
                    id="edit-bank-name"
                    value={draftName}
                    onChange={(e) => { setDraftName(e.target.value); setEditErrors((current) => { const next = { ...current }; delete next.name; return next; }); }}
                    maxLength={200}
                    aria-invalid={Boolean(editErrors.name)}
                    aria-describedby={editErrors.name ? "edit-bank-name-error" : undefined}
                  />
                  <FieldError id="edit-bank-name-error" className="mt-1">{editErrors.name}</FieldError>
                </div>
                <div>
                  <Label htmlFor="edit-bank-legal-name">Legal name (optional)</Label>
                  <Input
                    id="edit-bank-legal-name"
                    value={draftLegalName}
                    onChange={(event) => setDraftLegalName(event.target.value)}
                    maxLength={200}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="edit-provider-type">Provider type</Label>
                  <Select value={draftProviderType} onValueChange={(value: ProviderType) => setDraftProviderType(value)}>
                    <SelectTrigger id="edit-provider-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank">Bank</SelectItem>
                      <SelectItem value="small_finance_bank">Small finance bank</SelectItem>
                      <SelectItem value="nbfc">NBFC</SelectItem>
                      <SelectItem value="hfc">Housing finance company</SelectItem>
                      <SelectItem value="fintech">Fintech</SelectItem>
                      <SelectItem value="other">Other provider</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5 rounded-xl border border-border p-3">
                  <Label htmlFor="edit-bank-logo">Verified logo (JPEG, PNG, or WebP)</Label>
                  <Input
                    id="edit-bank-logo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      const nextFile = event.target.files?.[0] ?? null;
                      if (nextFile && !["image/jpeg", "image/png", "image/webp"].includes(nextFile.type)) {
                        setLogoFile(null);
                        setEditErrors((current) => ({ ...current, logo: "Choose a JPEG, PNG, or WebP logo." }));
                        event.currentTarget.value = "";
                        return;
                      }
                      setLogoFile(nextFile);
                      setEditErrors((current) => { const next = { ...current }; delete next.logo; return next; });
                      if (nextFile) setLogoSource("");
                    }}
                    aria-invalid={Boolean(editErrors.logo)}
                    aria-describedby={editErrors.logo ? "edit-bank-logo-error" : undefined}
                  />
                  <FieldError id="edit-bank-logo-error" className="text-xs">{editErrors.logo}</FieldError>
                  {active.logo_source ? (
                    <p className="break-all text-xs text-text-secondary">
                      Current source: {active.logo_source}
                    </p>
                  ) : null}
                  <Label htmlFor="edit-bank-logo-source">Source for the new logo</Label>
                  <Input
                    id="edit-bank-logo-source"
                    value={logoSource}
                    onChange={(event) => { setLogoSource(event.target.value); setEditErrors((current) => { const next = { ...current }; delete next.logoSource; return next; }); }}
                    placeholder="Official brand portal or user-supplied licence reference"
                    maxLength={500}
                    disabled={!logoFile}
                    aria-invalid={Boolean(editErrors.logoSource)}
                    aria-describedby={editErrors.logoSource ? "edit-bank-logo-source-error" : undefined}
                  />
                  <FieldError id="edit-bank-logo-source-error" className="text-xs">{editErrors.logoSource}</FieldError>
                  <p className="text-xs text-text-secondary">
                    Raw SVG upload is disabled. Repository-reviewed SVGs may be assigned by
                    engineering after source verification.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-bank-active"
                    checked={draftActive}
                    onCheckedChange={(v) => setDraftActive(v === true)}
                  />
                  <Label htmlFor="edit-bank-active" className="font-normal">
                    Active (selectable by staff)
                  </Label>
                </div>
              </div>
              <DialogFooter className="items-center justify-between sm:justify-between">
                {active.application_count === 0 && active.offer_count === 0 ? (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setDeleteTarget(active);
                      setActive(null);
                    }}
                    disabled={busy}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Delete provider
                  </Button>
                ) : (
                  <p className="max-w-xs text-left text-xs leading-5 text-text-secondary">
                    Used providers cannot be deleted. Disable this provider to preserve application
                    and offer history.
                  </p>
                )}
                <Button onClick={() => void onSaveEdit()} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          {deleteTarget ? (
            <>
              <DialogHeader>
                <DialogTitle>Delete {deleteTarget.name}?</DialogTitle>
                <DialogDescription>
                  This permanently removes the unused provider, its logo, and availability
                  configuration. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={busy}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={() => void onDelete()} disabled={busy}>
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  Delete provider
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
