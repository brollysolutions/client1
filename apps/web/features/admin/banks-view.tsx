"use client";

import * as React from "react";
import { ImageIcon, Inbox, Loader2, Plus } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createBank,
  updateBank,
  uploadProviderLogo,
  type AdminBank,
  type ProviderType,
} from "@/lib/loan-config-api";
import { isAllowedAssetUrl } from "@/lib/allowed-asset-url";
import { formatLastUpdated } from "@/lib/format";
import { useBanks } from "./use-banks";

const PROVIDERS_PER_PAGE = 24;

export function BanksView() {
  const { items, loading, error, reload } = useBanks();
  const [active, setActive] = React.useState<AdminBank | null>(null);
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
  const [providerQuery, setProviderQuery] = React.useState("");
  const [providerPage, setProviderPage] = React.useState(1);

  const filteredProviders = React.useMemo(() => {
    const normalized = providerQuery.trim().toLocaleLowerCase("en-IN");
    if (!normalized) return items;
    return items.filter((provider) =>
      [provider.name, provider.legal_name ?? "", provider.provider_type].some((value) =>
        value.toLocaleLowerCase("en-IN").includes(normalized),
      ),
    );
  }, [items, providerQuery]);
  const providerPageCount = Math.max(
    1,
    Math.ceil(filteredProviders.length / PROVIDERS_PER_PAGE),
  );
  const visibleProviders = filteredProviders.slice(
    (providerPage - 1) * PROVIDERS_PER_PAGE,
    providerPage * PROVIDERS_PER_PAGE,
  );

  function openEdit(bank: AdminBank) {
    setActive(bank);
    setDraftName(bank.name);
    setDraftLegalName(bank.legal_name ?? "");
    setDraftProviderType(bank.provider_type);
    setDraftActive(bank.active);
    setLogoFile(null);
    setLogoSource("");
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (newName.trim().length === 0) {
      toast.error("Name can't be empty");
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
      toast.error("Couldn't add bank", { description: res.error });
    }
  }

  async function onSaveEdit() {
    if (!active) return;
    if (draftName.trim().length === 0) {
      toast.error("Name can't be empty");
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
      toast.error("Add the official or licensed source for this logo");
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
      toast.error("Provider details saved, but the logo was not updated", {
        description: logoResult.error,
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <p className="text-sm text-text-secondary">
          Reusable provider and logo library for banks, NBFCs, housing-finance companies, and
          fintechs. Disable instead of deleting so historical records stay intact.
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          New provider
        </Button>
      </div>

      {items.length > 0 ? (
        <div className="grid max-w-md gap-1.5">
          <Label htmlFor="provider-library-search">Search provider library</Label>
          <Input
            id="provider-library-search"
            type="search"
            value={providerQuery}
            onChange={(event) => {
              setProviderQuery(event.target.value);
              setProviderPage(1);
            }}
            placeholder="Name or provider type"
          />
        </div>
      ) : null}

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
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
          <Inbox className="h-8 w-8 text-text-secondary" aria-hidden="true" />
          <p className="mt-3 font-medium text-text-primary">No providers yet</p>
          <p className="mt-1 text-sm text-text-secondary">
            Add the first provider to build the reusable logo and offer library.
          </p>
        </div>
      ) : filteredProviders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <p className="font-medium text-text-primary">No providers match that search</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setProviderQuery("")}
          >
            Clear search
          </Button>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {visibleProviders.map((bank) => (
              <li key={bank.id}>
                <button
                  type="button"
                  onClick={() => openEdit(bank)}
                  className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-brand-cta focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-cta/40"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
                        {bank.logo_url && isAllowedAssetUrl(bank.logo_url) ? <Image src={bank.logo_url} alt="" fill sizes="64px" className="object-contain p-1" /> : <ImageIcon className="h-4 w-4 text-text-secondary" aria-hidden />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-text-primary">{bank.name}</p>
                        <p className="truncate text-xs text-text-secondary">{bank.provider_type.replaceAll("_", " ")}</p>
                      </div>
                    </div>
                  <p className="mt-0.5 truncate text-xs text-text-secondary">
                    {bank.application_count === 0
                      ? "Not used yet"
                      : `Funded ${bank.application_count} application${bank.application_count === 1 ? "" : "s"}`}
                  </p>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    {formatLastUpdated(bank.updated_at)}
                  </p>
                  </div>
                  <Badge variant={bank.active ? "secondary" : "outline"} className="shrink-0">
                    {bank.active ? "Active" : "Disabled"}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
          {providerPageCount > 1 ? (
            <nav className="flex items-center justify-between gap-3" aria-label="Provider library pages">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={providerPage <= 1}
                onClick={() => setProviderPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <span className="text-xs tabular-nums text-text-secondary">
                Page {providerPage} of {providerPageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={providerPage >= providerPageCount}
                onClick={() =>
                  setProviderPage((current) => Math.min(providerPageCount, current + 1))
                }
              >
                Next
              </Button>
            </nav>
          ) : null}
        </>
      )}

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
                <Label htmlFor="new-bank-name">Display name</Label>
              <Input
                id="new-bank-name"
                value={newName}
                onChange={(ev) => setNewName(ev.target.value)}
                placeholder="Enter provider name"
                maxLength={200}
              />
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
                  <Label htmlFor="edit-bank-name">Display name</Label>
                  <Input
                    id="edit-bank-name"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    maxLength={200}
                  />
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
                      setLogoFile(nextFile);
                      if (nextFile) setLogoSource("");
                    }}
                  />
                  {active.logo_source ? (
                    <p className="break-all text-xs text-text-secondary">
                      Current source: {active.logo_source}
                    </p>
                  ) : null}
                  <Label htmlFor="edit-bank-logo-source">Source for the new logo</Label>
                  <Input
                    id="edit-bank-logo-source"
                    value={logoSource}
                    onChange={(event) => setLogoSource(event.target.value)}
                    placeholder="Official brand portal or user-supplied licence reference"
                    maxLength={500}
                    disabled={!logoFile}
                  />
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
              <DialogFooter>
                <Button onClick={() => void onSaveEdit()} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
