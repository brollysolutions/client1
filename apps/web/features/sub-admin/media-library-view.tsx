"use client";
/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import { Archive, ImageIcon, Images, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { components } from "@contracts/generated/schema";

import { FileField } from "@/components/apply-as-agent/file-field";
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
import { DashboardHeader, DashboardPage } from "@/features/dashboard/dashboard-ui";
import { FetchError } from "@/features/dashboard/fetch-error";
import {
  createCampaignMedia,
  deleteCampaignMedia,
  getCampaignMediaUploadUrl,
  listCampaignMedia,
  updateCampaignMedia,
  type CampaignMediaAsset,
} from "@/lib/campaign-media-api";
import { uploadFileToPresignedPost } from "@/lib/agent-application";

import { BannerTemplateManager } from "./banner-template-manager";
import { CmsWorkspaceHeader, CMS_WORKSPACE_DIALOG_CLASS } from "./cms-workspace";

type Schemas = components["schemas"];
type UsageType = Schemas["CampaignMediaCreate"]["usage_type"];

const USAGE_LABEL: Record<string, string> = {
  public_banner: "Public banner",
  sponsor: "Sponsor strip",
  dashboard_banner: "Dashboard banner",
  dashboard_offer: "Dashboard offer",
  campaign: "Multi-use campaign",
};
const USAGE_OPTIONS: Array<{ value: UsageType; label: string }> = [
  { value: "dashboard_banner", label: "Dashboard banner" },
  { value: "dashboard_offer", label: "Dashboard offer" },
  { value: "campaign", label: "Banner or offer" },
];

export function MediaLibraryView() {
  const [assets, setAssets] = React.useState<CampaignMediaAsset[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [usage, setUsage] = React.useState("all");
  const [line, setLine] = React.useState("all");
  const [selected, setSelected] = React.useState<CampaignMediaAsset | null>(null);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [editTitle, setEditTitle] = React.useState("");
  const [editAltText, setEditAltText] = React.useState("");
  const [editTags, setEditTags] = React.useState("");
  const [editSource, setEditSource] = React.useState("");
  const [metadataBusy, setMetadataBusy] = React.useState(false);

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

  React.useEffect(() => {
    if (!selected) return;
    setEditTitle(selected.title);
    setEditAltText(selected.alt_text);
    setEditTags(selected.tags.join(", "));
    setEditSource(selected.source_reference ?? "");
  }, [selected]);

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return assets.filter(
      (asset) =>
        (usage === "all" || asset.usage_type === usage) &&
        (line === "all" || asset.business_line === line || asset.business_line === "both") &&
        (!needle ||
          [asset.title, asset.alt_text, asset.source_reference ?? "", ...asset.tags]
            .join(" ")
            .toLowerCase()
            .includes(needle)),
    );
  }, [assets, line, search, usage]);
  const editedTagList = React.useMemo(
    () => editTags.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean),
    [editTags],
  );
  const metadataDirty = Boolean(
    selected &&
    (editTitle.trim() !== selected.title ||
      editAltText.trim() !== selected.alt_text ||
      JSON.stringify(editedTagList) !== JSON.stringify(selected.tags) ||
      editSource.trim() !== (selected.source_reference ?? "")),
  );

  async function setActive(asset: CampaignMediaAsset, active: boolean) {
    const response = await updateCampaignMedia(asset.id, { active });
    if (!response.ok) return void toast.error("Could not update artwork", { description: response.error });
    toast.success(active ? "Artwork restored" : "Artwork archived");
    setSelected(response.data);
    await load();
  }

  async function remove(asset: CampaignMediaAsset) {
    if (!window.confirm(`Permanently delete “${asset.title}”? This is allowed only when unused.`)) return;
    const response = await deleteCampaignMedia(asset.id);
    if (!response.ok) return void toast.error("Could not delete artwork", { description: response.error });
    toast.success("Unused artwork deleted");
    setSelected(null);
    await load();
  }

  async function saveMetadata(asset: CampaignMediaAsset) {
    if (!editTitle.trim() || !editAltText.trim()) {
      return void toast.error("Title and accessible alt text are required");
    }
    setMetadataBusy(true);
    const response = await updateCampaignMedia(asset.id, {
      title: editTitle.trim(),
      alt_text: editAltText.trim(),
      tags: editedTagList,
      source_reference: editSource.trim() || null,
    });
    setMetadataBusy(false);
    if (!response.ok) {
      return void toast.error("Could not save artwork details", { description: response.error });
    }
    toast.success("Artwork details updated");
    setSelected(response.data);
    await load();
  }

  return (
    <DashboardPage>
      <DashboardHeader
        title="Campaign Media Library"
        description="Upload once, reuse safely, and see every banner, offer, or governed placement that depends on each artwork."
        actions={<Button onClick={() => setUploadOpen(true)}><Plus className="h-4 w-4" />Upload artwork</Button>}
      />

      <BannerTemplateManager />

      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(14rem,1fr)_12rem_12rem_auto]">
          <Label className="relative block">
            <span className="sr-only">Search media</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-text-secondary" />
            <Input type="search" name="media_search" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search title, alt text, source, or tag" />
          </Label>
          <Select value={usage} onValueChange={setUsage}><SelectTrigger aria-label="Filter by usage"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All placements</SelectItem>{Object.entries(USAGE_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
          <Select value={line} onValueChange={setLine}><SelectTrigger aria-label="Filter by business line"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All business lines</SelectItem><SelectItem value="loans">Loans</SelectItem><SelectItem value="real_estate">Real Estate</SelectItem></SelectContent></Select>
          <div className="flex items-center rounded-lg bg-[var(--nav-tint)] px-3 text-sm font-medium text-[var(--nav-primary)]">{filtered.length} assets</div>
        </div>

        {error ? <FetchError status={null} message={error} onRetry={() => void load()} /> : null}
        {loading ? <div className="grid min-h-52 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-brand-blue" /></div> : null}
        {!loading && !error && filtered.length === 0 ? <div className="grid min-h-52 place-items-center rounded-xl border border-dashed border-border text-center"><div><Images className="mx-auto h-8 w-8 text-text-secondary" /><p className="mt-3 font-medium">No artwork matches these filters</p><p className="mt-1 text-sm text-text-secondary">Try another search or upload a new campaign asset.</p></div></div> : null}
        {!loading && filtered.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((asset) => (
              <li key={asset.id}>
                <button type="button" onClick={() => setSelected(asset)} className="group w-full overflow-hidden rounded-xl border border-border bg-background text-left transition hover:-translate-y-0.5 hover:border-[var(--nav-primary)]/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <img src={asset.image_url} alt={asset.alt_text} width={1200} height={600} loading="lazy" className="aspect-[2/1] w-full bg-muted object-cover" />
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-text-primary">{asset.title}</p><p className="mt-1 text-xs text-text-secondary">{USAGE_LABEL[asset.usage_type] ?? asset.usage_type} · {asset.business_line === "both" ? "Both lines" : asset.business_line.replace("_", " ")}</p></div><Badge variant={asset.active ? "secondary" : "outline"}>{asset.active ? "Ready" : "Archived"}</Badge></div>
                    <div className="flex flex-wrap gap-2 text-xs text-text-secondary"><span>{asset.width && asset.height ? `${asset.width}×${asset.height}` : "Bundled size"}</span><span>·</span><span>{asset.usage_count} {asset.usage_count === 1 ? "use" : "uses"}</span><span>·</span><span className="capitalize">{asset.source_type}</span></div>
                    {asset.tags.length ? <div className="flex flex-wrap gap-1.5">{asset.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded-full bg-muted px-2 py-1 text-[11px] text-text-secondary">{tag}</span>)}</div> : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <MediaUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onCreated={() => void load()} />
      <Dialog open={selected !== null} onOpenChange={(open) => { if (open || metadataBusy) return; if (metadataDirty && !window.confirm("Discard unsaved artwork details?")) return; setSelected(null); }}>
        <DialogContent showCloseButton={false} className="max-h-[92dvh] max-w-3xl overflow-y-auto">
          {selected ? <><CmsWorkspaceHeader title={selected.title} description={`${USAGE_LABEL[selected.usage_type] ?? selected.usage_type} · ${selected.usage_count} active and historical references`} /><div className="grid gap-5 py-3 md:grid-cols-[minmax(0,1.1fr)_minmax(18rem,.9fr)]"><div className="space-y-4"><div className="overflow-hidden rounded-xl border border-border bg-muted"><img src={selected.image_url} alt={selected.alt_text} width={1200} height={600} className="aspect-[2/1] w-full object-cover" /></div><div className="grid gap-3 rounded-xl border border-border p-4 text-sm sm:grid-cols-2"><Detail label="Placement" value={USAGE_LABEL[selected.usage_type] ?? selected.usage_type} /><Detail label="Business line" value={selected.business_line === "both" ? "Both lines" : selected.business_line.replace("_", " ")} /><Detail label="File" value={`${selected.mime_type}${selected.byte_size ? ` · ${(selected.byte_size / 1024).toFixed(0)} KB` : ""}`} /><Detail label="Dimensions" value={selected.width && selected.height ? `${selected.width} × ${selected.height}` : "Bundled artwork"} /></div><div><p className="text-xs font-medium text-text-secondary">Where used</p>{selected.usages.length ? <ul className="mt-2 space-y-2">{selected.usages.map((item) => <li key={`${item.kind}-${item.entity_id}`} className="rounded-lg border border-border p-2 text-sm"><p className="font-medium">{item.label}</p><p className="text-xs capitalize text-text-secondary">{item.kind.replace("_", " ")} · {item.status.replace("_", " ")}</p></li>)}</ul> : <p className="mt-1 text-sm text-text-secondary">Not used by a campaign.</p>}</div></div><div className="space-y-4 rounded-xl border border-border p-4"><div><Label htmlFor="media-edit-title">Internal title</Label><Input id="media-edit-title" name="title" value={editTitle} maxLength={160} onChange={(event) => setEditTitle(event.target.value)} /></div><div><Label htmlFor="media-edit-alt">Accessible alt text</Label><Textarea id="media-edit-alt" name="alt_text" value={editAltText} maxLength={300} onChange={(event) => setEditAltText(event.target.value)} /></div><div><Label htmlFor="media-edit-tags">Tags</Label><Input id="media-edit-tags" name="tags" value={editTags} maxLength={500} onChange={(event) => setEditTags(event.target.value)} /><p className="mt-1 text-xs text-text-secondary">Comma-separated; up to 12 tags, 40 characters each.</p></div><div><Label htmlFor="media-edit-source">Source or licence note</Label><Input id="media-edit-source" name="source_reference" value={editSource} maxLength={500} onChange={(event) => setEditSource(event.target.value)} placeholder={selected.source_type} /></div><Button className="w-full" disabled={metadataBusy || !metadataDirty} onClick={() => void saveMetadata(selected)}>{metadataBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save details</Button></div></div><DialogFooter><Button variant="outline" disabled={metadataBusy || metadataDirty} onClick={() => void setActive(selected, !selected.active)}><Archive className="h-4 w-4" />{selected.active ? "Archive" : "Restore"}</Button><Button variant="destructive" disabled={metadataBusy || metadataDirty || selected.usage_count > 0} onClick={() => void remove(selected)}><Trash2 className="h-4 w-4" />Delete unused</Button></DialogFooter></> : null}
        </DialogContent>
      </Dialog>
    </DashboardPage>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-medium text-text-secondary">{label}</p><p className="mt-1 text-sm leading-6 text-text-primary">{value}</p></div>;
}

function MediaUploadDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [title, setTitle] = React.useState("");
  const [altText, setAltText] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [line, setLine] = React.useState<"loans" | "real_estate" | "both">("both");
  const [usage, setUsage] = React.useState<UsageType>("campaign");
  const [source, setSource] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const dirty = Boolean(file || title || altText || tags || source);

  function reset() {
    setFile(null);
    setTitle("");
    setAltText("");
    setTags("");
    setSource("");
  }

  function close(next: boolean) {
    if (!next && busy) return;
    if (!next && dirty && !window.confirm("Discard this unsaved artwork upload?")) return;
    if (!next) reset();
    onOpenChange(next);
  }

  async function upload() {
    if (!file || !title.trim() || !altText.trim()) return void toast.error("Add artwork, title, and alt text");
    setBusy(true);
    const presign = await getCampaignMediaUploadUrl({ content_type: file.type as Schemas["CampaignMediaUploadRequest"]["content_type"], filename: file.name });
    if (!presign.ok) { setBusy(false); return void toast.error("Could not start upload", { description: presign.error }); }
    const uploaded = await uploadFileToPresignedPost(presign.data.upload_url, presign.data.fields, file);
    if (!uploaded.ok) { setBusy(false); return void toast.error("Artwork upload failed"); }
    const created = await createCampaignMedia({ business_line: line, usage_type: usage, title: title.trim(), alt_text: altText.trim(), tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), object_key: presign.data.object_key, content_type: file.type as Schemas["CampaignMediaCreate"]["content_type"], source_reference: source.trim() || null });
    setBusy(false);
    if (!created.ok) return void toast.error("Could not add artwork", { description: created.error });
    toast.success("Artwork added to the campaign library");
    reset();
    onOpenChange(false); onCreated();
  }

  return <Dialog open={open} onOpenChange={close}><DialogContent showCloseButton={false} className={CMS_WORKSPACE_DIALOG_CLASS}><CmsWorkspaceHeader title="Upload campaign artwork" description="Images are scanned, stripped of metadata, normalized, and stored as immutable public campaign assets." /><div className="grid min-h-0 gap-6 overflow-y-auto py-3 lg:grid-cols-[18rem_minmax(0,1fr)]"><FileField id="campaign-artwork" label="Artwork" icon={ImageIcon} value={file} onChange={setFile} accept="image/jpeg,image/png,image/webp" maxBytes={4 * 1024 * 1024} hint="Landscape JPG, PNG or WEBP · max 4 MB" disabled={busy} /><div className="space-y-4"><div><Label htmlFor="media-title">Internal title</Label><Input id="media-title" name="title" value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="Client loan progress" /></div><div><Label htmlFor="media-alt">Accessible alt text</Label><Textarea id="media-alt" name="alt_text" value={altText} maxLength={300} onChange={(event) => setAltText(event.target.value)} placeholder="Describe the meaningful visual content" /></div><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="media-usage">Intended use</Label><Select name="usage_type" value={usage} onValueChange={(value) => setUsage(value as UsageType)}><SelectTrigger id="media-usage"><SelectValue /></SelectTrigger><SelectContent>{USAGE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="media-line">Business line</Label><Select name="business_line" value={line} onValueChange={(value) => setLine(value as typeof line)}><SelectTrigger id="media-line"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="both">Both lines</SelectItem><SelectItem value="loans">Loans</SelectItem><SelectItem value="real_estate">Real Estate</SelectItem></SelectContent></Select></div></div><div><Label htmlFor="media-tags">Tags</Label><Input id="media-tags" name="tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="client, loan journey, blue" /><p className="mt-1 text-xs text-text-secondary">Comma-separated, up to 12 tags.</p></div><div><Label htmlFor="media-source">Source or licence note</Label><Input id="media-source" name="source_reference" value={source} maxLength={500} onChange={(event) => setSource(event.target.value)} placeholder="Commission, licensed stock, or generated collection" /></div><DialogFooter><Button disabled={busy} onClick={() => void upload()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add to library</Button></DialogFooter></div></div></DialogContent></Dialog>;
}
