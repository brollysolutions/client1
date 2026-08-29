"use client";
/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import { Archive, Images, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
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
import { DashboardHeader, DashboardPage } from "@/features/dashboard/dashboard-ui";
import { FetchError } from "@/features/dashboard/fetch-error";
import {
  ARTWORK_SURFACE_ORDER,
  formatTargetSize,
  surfaceFor,
  type ArtworkUsageType,
} from "@/lib/campaign-artwork";
import {
  deleteCampaignMedia,
  getCampaignMedia,
  listCampaignMedia,
  updateCampaignMedia,
  type CampaignMediaAsset,
} from "@/lib/campaign-media-api";

import { ArtworkUploadDialog } from "./artwork-upload-dialog";
import { BannerTemplateManager } from "./banner-template-manager";
import { CmsWorkspaceHeader } from "./cms-workspace";

type SectionKey = ArtworkUsageType | "legacy";

/**
 * The Media Library, grouped by the surface each image is for.
 *
 * Every tile used to be force-cropped to 2:1 under a flat grid, so a 9:5 hero,
 * a 16:9 sponsor and a 16:7 offer card were visually identical and a Sub Admin
 * had to open each one to learn what it was. Sections now follow the surface,
 * and each tile renders at that surface's real shape.
 */
export function MediaLibraryView() {
  const [assets, setAssets] = React.useState<CampaignMediaAsset[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [line, setLine] = React.useState("all");
  const [showArchived, setShowArchived] = React.useState(false);
  const [selected, setSelected] = React.useState<CampaignMediaAsset | null>(null);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const load = React.useCallback(async () => {
    setLoading(true);
    const response = await listCampaignMedia();
    setLoading(false);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    setError(null);
    setAssets(response.data);
  }, []);

  React.useEffect(() => void load(), [load]);

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return assets.filter((asset) => {
      if (!showArchived && !asset.active) return false;
      if (line !== "all" && asset.business_line !== line && asset.business_line !== "both") {
        return false;
      }
      if (!needle) return true;
      return [asset.title, asset.alt_text, asset.source_reference ?? "", ...asset.tags]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [assets, line, search, showArchived]);

  const sections = React.useMemo(() => {
    const groups = new Map<SectionKey, CampaignMediaAsset[]>();
    for (const asset of filtered) {
      const key: SectionKey = ARTWORK_SURFACE_ORDER.includes(asset.usage_type as ArtworkUsageType)
        ? (asset.usage_type as ArtworkUsageType)
        : "legacy";
      const bucket = groups.get(key);
      if (bucket) bucket.push(asset);
      else groups.set(key, [asset]);
    }
    const ordered: { key: SectionKey; assets: CampaignMediaAsset[] }[] = [];
    for (const key of ARTWORK_SURFACE_ORDER) {
      const bucket = groups.get(key);
      if (bucket?.length) ordered.push({ key, assets: bucket });
    }
    const legacy = groups.get("legacy");
    if (legacy?.length) ordered.push({ key: "legacy", assets: legacy });
    return ordered;
  }, [filtered]);

  async function setActive(asset: CampaignMediaAsset, active: boolean) {
    const response = await updateCampaignMedia(asset.id, { active });
    if (!response.ok) {
      toast.error("Could not update artwork", { description: response.error });
      return;
    }
    toast.success(active ? "Artwork restored" : "Artwork archived");
    setSelected(response.data);
    await load();
  }

  async function remove(asset: CampaignMediaAsset) {
    const confirmed = await confirm({
      title: `Permanently delete “${asset.title}”?`,
      description:
        "The file is removed from storage for good. This is allowed only while no campaign uses it.",
      confirmLabel: "Delete artwork",
      destructive: true,
    });
    if (!confirmed) return;
    const response = await deleteCampaignMedia(asset.id);
    if (!response.ok) {
      toast.error("Could not delete artwork", { description: response.error });
      return;
    }
    toast.success("Unused artwork deleted");
    setSelected(null);
    await load();
  }

  return (
    <DashboardPage>
      {confirmDialog}
      <DashboardHeader
        title="Campaign Media Library"
        description="Artwork grouped by the surface it is made for. Upload once, reuse across campaigns, and see what depends on each image."
        actions={
          <Button onClick={() => setUploadOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Upload artwork
          </Button>
        }
      />

      <section className="space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(14rem,1fr)_12rem_auto_auto]">
          <Label className="relative block">
            <span className="sr-only">Search media</span>
            <Search
              className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-text-secondary"
              aria-hidden
            />
            <Input
              type="search"
              name="media_search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
              placeholder="Search title, alt text, source, or tag"
            />
          </Label>
          <Select value={line} onValueChange={setLine}>
            <SelectTrigger aria-label="Filter by business line">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All business lines</SelectItem>
              <SelectItem value="loans">Loans</SelectItem>
              <SelectItem value="real_estate">Real Estate</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant={showArchived ? "outline" : "ghost"}
            aria-pressed={showArchived}
            onClick={() => setShowArchived((current) => !current)}
          >
            <Archive className="h-4 w-4" aria-hidden />
            {showArchived ? "Archived shown" : "Show archived"}
          </Button>
          <div className="flex items-center rounded-lg bg-[var(--nav-tint)] px-3 text-sm font-medium text-[var(--nav-primary)]">
            {filtered.length} {filtered.length === 1 ? "asset" : "assets"}
          </div>
        </div>

        {error ? <FetchError status={null} message={error} onRetry={() => void load()} /> : null}

        {loading ? (
          <div className="grid min-h-52 place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand-blue" aria-hidden />
            <span className="sr-only">Loading artwork</span>
          </div>
        ) : null}

        {!loading && !error && filtered.length === 0 ? (
          <div className="grid min-h-52 place-items-center rounded-xl border border-dashed border-border text-center">
            <div>
              <Images className="mx-auto h-8 w-8 text-text-secondary" aria-hidden />
              <p className="mt-3 font-medium">No artwork matches these filters</p>
              <p className="mt-1 text-sm text-text-secondary">
                Try another search or upload a new campaign asset.
              </p>
            </div>
          </div>
        ) : null}

        {!loading && sections.length > 0
          ? sections.map((section) => (
              <SurfaceSection
                key={section.key}
                sectionKey={section.key}
                assets={section.assets}
                onSelect={setSelected}
              />
            ))
          : null}
      </section>

      <BannerTemplateManager />

      <ArtworkUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={() => void load()}
      />
      <AssetDetailDialog
        asset={selected}
        onClose={() => setSelected(null)}
        onSaved={async (next) => {
          setSelected(next);
          await load();
        }}
        onArchiveToggle={setActive}
        onDelete={remove}
      />
    </DashboardPage>
  );
}

function SurfaceSection({
  sectionKey,
  assets,
  onSelect,
}: {
  sectionKey: SectionKey;
  assets: CampaignMediaAsset[];
  onSelect: (asset: CampaignMediaAsset) => void;
}) {
  const surface = surfaceFor(sectionKey === "legacy" ? "public_banner" : sectionKey);
  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-2">
        <h2 className="font-heading text-sm font-semibold text-text-primary">{surface.label}</h2>
        <p className="text-xs text-text-secondary">
          {surface.description} · {formatTargetSize(surface)} · {assets.length}
        </p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {assets.map((asset) => (
          <li key={asset.id}>
            <button
              type="button"
              onClick={() => onSelect(asset)}
              className="group w-full overflow-hidden rounded-xl border border-border bg-background text-left transition hover:-translate-y-0.5 hover:border-[var(--nav-primary)]/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className={`relative block w-full bg-muted ${surface.aspectClass}`}>
                <img
                  src={asset.image_url}
                  alt={asset.alt_text}
                  width={surface.width}
                  height={surface.height}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </span>
              <span className="block space-y-3 p-4">
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-text-primary">
                      {asset.title}
                    </span>
                    <span className="mt-1 block text-xs text-text-secondary">
                      {asset.business_line === "both"
                        ? "Both lines"
                        : asset.business_line.replace("_", " ")}
                    </span>
                  </span>
                  <Badge variant={asset.active ? "secondary" : "outline"}>
                    {asset.active ? "Ready" : "Archived"}
                  </Badge>
                </span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
                  <span>
                    {asset.width && asset.height
                      ? `${asset.width}×${asset.height}`
                      : "Bundled size"}
                  </span>
                  <span aria-hidden>·</span>
                  <span>
                    {asset.usage_count} {asset.usage_count === 1 ? "use" : "uses"}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="capitalize">{asset.source_type}</span>
                </span>
                {asset.tags.length ? (
                  <span className="flex flex-wrap gap-1.5">
                    {asset.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-muted px-2 py-1 text-[11px] text-text-secondary"
                      >
                        {tag}
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AssetDetailDialog({
  asset,
  onClose,
  onSaved,
  onArchiveToggle,
  onDelete,
}: {
  asset: CampaignMediaAsset | null;
  onClose: () => void;
  onSaved: (asset: CampaignMediaAsset) => Promise<void>;
  onArchiveToggle: (asset: CampaignMediaAsset, active: boolean) => Promise<void>;
  onDelete: (asset: CampaignMediaAsset) => Promise<void>;
}) {
  const [title, setTitle] = React.useState("");
  const [altText, setAltText] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [source, setSource] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const [usages, setUsages] = React.useState<CampaignMediaAsset["usages"]>([]);

  React.useEffect(() => {
    if (!asset) return;
    setTitle(asset.title);
    setAltText(asset.alt_text);
    setTags(asset.tags.join(", "));
    setSource(asset.source_reference ?? "");
  }, [asset]);

  // The listing omits the itemised usage list to keep one page load to a few
  // queries, so "Where used" is fetched when a detail view actually opens.
  React.useEffect(() => {
    if (!asset) {
      setUsages([]);
      return;
    }
    if (asset.usages.length) {
      setUsages(asset.usages);
      return;
    }
    let active = true;
    setUsages([]);
    void getCampaignMedia(asset.id).then((response) => {
      if (active && response.ok) setUsages(response.data.usages);
    });
    return () => {
      active = false;
    };
  }, [asset]);

  const tagList = React.useMemo(
    () =>
      tags
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    [tags],
  );
  const dirty = Boolean(
    asset &&
      (title.trim() !== asset.title ||
        altText.trim() !== asset.alt_text ||
        JSON.stringify(tagList) !== JSON.stringify(asset.tags) ||
        source.trim() !== (asset.source_reference ?? "")),
  );

  async function save() {
    if (!asset) return;
    if (!title.trim() || !altText.trim()) {
      toast.error("Title and accessible alt text are required");
      return;
    }
    setBusy(true);
    const response = await updateCampaignMedia(asset.id, {
      title: title.trim(),
      alt_text: altText.trim(),
      tags: tagList,
      source_reference: source.trim() || null,
    });
    setBusy(false);
    if (!response.ok) {
      toast.error("Could not save artwork details", { description: response.error });
      return;
    }
    toast.success("Artwork details updated");
    await onSaved(response.data);
  }

  const surface = asset ? surfaceFor(asset.usage_type) : null;

  return (
    <Dialog
      open={asset !== null}
      onOpenChange={(open) => {
        if (open || busy) return;
        if (!dirty) return onClose();
        // Synchronous handler: keep the dialog open and let the confirmation
        // above it decide.
        void confirm({
          title: "Discard unsaved artwork details?",
          description: "Your changes to the title, alt text, tags, or source note will be lost.",
          confirmLabel: "Discard changes",
          destructive: true,
        }).then((confirmed) => {
          if (confirmed) onClose();
        });
      }}
    >
      <DialogContent showCloseButton={false} className="max-h-[92dvh] max-w-3xl overflow-y-auto">
        {confirmDialog}
        {asset && surface ? (
          <>
            <CmsWorkspaceHeader
              title={asset.title}
              description={`${surface.label} · ${formatTargetSize(surface)} · ${asset.usage_count} active and historical references`}
            />
            <div className="grid gap-5 py-3 md:grid-cols-[minmax(0,1.1fr)_minmax(18rem,.9fr)]">
              <div className="space-y-4">
                <div
                  className={`relative overflow-hidden rounded-xl border border-border bg-muted ${surface.aspectClass}`}
                >
                  <img
                    src={asset.image_url}
                    alt={asset.alt_text}
                    width={surface.width}
                    height={surface.height}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </div>
                <dl className="grid gap-3 rounded-xl border border-border p-4 text-sm sm:grid-cols-2">
                  <Detail label="Surface" value={surface.label} />
                  <Detail
                    label="Business line"
                    value={
                      asset.business_line === "both"
                        ? "Both lines"
                        : asset.business_line.replace("_", " ")
                    }
                  />
                  <Detail
                    label="File"
                    value={`${asset.mime_type}${
                      asset.byte_size ? ` · ${(asset.byte_size / 1024).toFixed(0)} KB` : ""
                    }`}
                  />
                  <Detail
                    label="Dimensions"
                    value={
                      asset.width && asset.height
                        ? `${asset.width} × ${asset.height}`
                        : "Bundled artwork"
                    }
                  />
                </dl>
                <div>
                  <p className="text-xs font-medium text-text-secondary">Where used</p>
                  {usages.length ? (
                    <ul className="mt-2 space-y-2">
                      {usages.map((item) => (
                        <li
                          key={`${item.kind}-${item.entity_id}`}
                          className="rounded-lg border border-border p-2 text-sm"
                        >
                          <p className="font-medium">{item.label}</p>
                          <p className="text-xs capitalize text-text-secondary">
                            {item.kind.replace("_", " ")} · {item.status.replace("_", " ")}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm text-text-secondary">
                      {asset.usage_count > 0 ? "Loading references…" : "Not used by a campaign."}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-4 rounded-xl border border-border p-4">
                <div>
                  <Label htmlFor="media-edit-title">Internal title</Label>
                  <Input
                    id="media-edit-title"
                    name="title"
                    value={title}
                    maxLength={160}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="media-edit-alt">Accessible alt text</Label>
                  <Textarea
                    id="media-edit-alt"
                    name="alt_text"
                    value={altText}
                    maxLength={300}
                    onChange={(event) => setAltText(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="media-edit-tags">Tags</Label>
                  <Input
                    id="media-edit-tags"
                    name="tags"
                    value={tags}
                    maxLength={500}
                    onChange={(event) => setTags(event.target.value)}
                  />
                  <p className="mt-1 text-xs text-text-secondary">
                    Comma-separated; up to 12 tags, 40 characters each.
                  </p>
                </div>
                <div>
                  <Label htmlFor="media-edit-source">Source or licence note</Label>
                  <Input
                    id="media-edit-source"
                    name="source_reference"
                    value={source}
                    maxLength={500}
                    onChange={(event) => setSource(event.target.value)}
                    placeholder={asset.source_type}
                  />
                </div>
                <Button className="w-full" disabled={busy || !dirty} onClick={() => void save()}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Save details
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={busy || dirty}
                onClick={() => void onArchiveToggle(asset, !asset.active)}
              >
                <Archive className="h-4 w-4" aria-hidden />
                {asset.active ? "Archive" : "Restore"}
              </Button>
              <Button
                variant="destructive"
                disabled={busy || dirty || asset.usage_count > 0}
                onClick={() => void onDelete(asset)}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Delete unused
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-text-secondary">{label}</dt>
      <dd className="mt-1 text-sm leading-6 text-text-primary">{value}</dd>
    </div>
  );
}
