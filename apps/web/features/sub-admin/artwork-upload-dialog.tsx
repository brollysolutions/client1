"use client";

import * as React from "react";
import { ImageIcon, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { FileField } from "@/components/apply-as-agent/file-field";
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
import { PANEL_DIALOG_WIDE_CLASS, WorkspaceDialogHeader } from "@/features/dashboard/workspace-dialog";
import {
  ARTWORK_SURFACES,
  ARTWORK_SURFACE_ORDER,
  formatTargetSize,
  type ArtworkUsageType,
} from "@/lib/campaign-artwork";
import {
  CAMPAIGN_IMAGE_ACCEPT,
  CAMPAIGN_IMAGE_MAX_BYTES,
  uploadCampaignArtwork,
  type CampaignMediaAsset,
} from "@/lib/campaign-media-api";

type BusinessLine = "loans" | "real_estate" | "both";

/**
 * One upload form, shared by the Media Library page and the artwork step of the
 * banner and offer editors.
 *
 * When it is opened from an editor the surface is already known, so the usage
 * type is fixed and shown as guidance instead of asked for -- picking the wrong
 * one there is how artwork ends up rejected on save.
 */
export function ArtworkUploadDialog({
  open,
  onOpenChange,
  onUploaded,
  fixedUsageType,
  defaultUsageType = "campaign",
  defaultBusinessLine = "both",
  allowedUsageTypes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (asset: CampaignMediaAsset) => void;
  /** Locks the surface — used when uploading from inside a campaign editor. */
  fixedUsageType?: ArtworkUsageType;
  defaultUsageType?: ArtworkUsageType;
  defaultBusinessLine?: BusinessLine;
  allowedUsageTypes?: readonly ArtworkUsageType[];
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [title, setTitle] = React.useState("");
  const [altText, setAltText] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [source, setSource] = React.useState("");
  const [line, setLine] = React.useState<BusinessLine>(defaultBusinessLine);
  const [usage, setUsage] = React.useState<ArtworkUsageType>(fixedUsageType ?? defaultUsageType);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (fixedUsageType) setUsage(fixedUsageType);
  }, [fixedUsageType]);
  React.useEffect(() => setLine(defaultBusinessLine), [defaultBusinessLine]);

  const surface = ARTWORK_SURFACES[usage];
  const dirty = Boolean(file || title || altText || tags || source);
  const usageOptions = (allowedUsageTypes ?? ARTWORK_SURFACE_ORDER).filter(
    (value) => value in ARTWORK_SURFACES,
  );

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

  async function submit() {
    if (!file || !title.trim() || !altText.trim()) {
      toast.error("Add artwork, an internal title, and alt text");
      return;
    }
    setBusy(true);
    const result = await uploadCampaignArtwork({
      file,
      title: title.trim(),
      altText: altText.trim(),
      usageType: usage,
      businessLine: line,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      sourceReference: source.trim() || null,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error("Could not add artwork", { description: result.error });
      return;
    }
    toast.success("Artwork added to the library");
    reset();
    onOpenChange(false);
    onUploaded(result.data);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent showCloseButton={false} className={PANEL_DIALOG_WIDE_CLASS}>
        <WorkspaceDialogHeader
          title="Upload campaign artwork"
          description="Images are scanned, stripped of metadata, re-encoded, and stored as immutable campaign assets."
        />
        <div className="grid min-h-0 gap-6 overflow-y-auto py-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <div className="space-y-3">
            <FileField
              id="campaign-artwork"
              label="Artwork"
              icon={ImageIcon}
              value={file}
              onChange={setFile}
              accept={CAMPAIGN_IMAGE_ACCEPT}
              maxBytes={CAMPAIGN_IMAGE_MAX_BYTES}
              hint="JPG, PNG or WEBP · max 4 MB"
              disabled={busy}
            />
            <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs leading-5 text-text-secondary">
              <p className="font-medium text-text-primary">
                {surface.label} · {formatTargetSize(surface)}
              </p>
              <p className="mt-1">{surface.composition}</p>
              <p className="mt-1">
                Artwork shaped for a different surface is rejected on upload.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="artwork-title">Internal title</Label>
              <Input
                id="artwork-title"
                name="title"
                value={title}
                maxLength={160}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Diwali home loan family"
              />
              <p className="mt-1 text-xs text-text-secondary">
                How this image is listed in the library. Customers never see it.
              </p>
            </div>
            <div>
              <Label htmlFor="artwork-alt">Accessible alt text</Label>
              <Textarea
                id="artwork-alt"
                name="alt_text"
                value={altText}
                maxLength={300}
                onChange={(event) => setAltText(event.target.value)}
                placeholder="Describe the meaningful visual content"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {fixedUsageType ? null : (
                <div>
                  <Label htmlFor="artwork-usage">Where it will be used</Label>
                  <Select
                    name="usage_type"
                    value={usage}
                    onValueChange={(value) => setUsage(value as ArtworkUsageType)}
                  >
                    <SelectTrigger id="artwork-usage">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {usageOptions.map((value) => (
                        <SelectItem key={value} value={value}>
                          {ARTWORK_SURFACES[value].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label htmlFor="artwork-line">Business line</Label>
                <Select
                  name="business_line"
                  value={line}
                  onValueChange={(value) => setLine(value as BusinessLine)}
                >
                  <SelectTrigger id="artwork-line">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Both lines</SelectItem>
                    <SelectItem value="loans">Loans</SelectItem>
                    <SelectItem value="real_estate">Real Estate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="artwork-tags">Tags</Label>
              <Input
                id="artwork-tags"
                name="tags"
                value={tags}
                maxLength={500}
                onChange={(event) => setTags(event.target.value)}
                placeholder="festive, family, home loan"
              />
              <p className="mt-1 text-xs text-text-secondary">
                Comma-separated; up to 12 tags of 40 characters each.
              </p>
            </div>
            <div>
              <Label htmlFor="artwork-source">Source or licence note</Label>
              <Input
                id="artwork-source"
                name="source_reference"
                value={source}
                maxLength={500}
                onChange={(event) => setSource(event.target.value)}
                placeholder="Commission, licensed stock, or generated collection"
              />
            </div>
            <DialogFooter>
              <Button disabled={busy} onClick={() => void submit()}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Plus className="h-4 w-4" aria-hidden />
                )}
                {busy ? "Uploading…" : "Add to library"}
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
