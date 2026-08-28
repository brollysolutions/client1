"use client";

import * as React from "react";
import { ImageIcon, Layers3, Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { components } from "@contracts/generated/schema";

import { FileField } from "@/components/apply-as-agent/file-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { uploadFileToPresignedPost } from "@/lib/agent-application";
import {
  createBannerTemplateVersion,
  getBannerTemplateImageUploadUrl,
  listBannerTemplates,
  type BannerTemplate,
} from "@/lib/banners-api";
import { CmsWorkspaceHeader, CMS_WORKSPACE_DIALOG_CLASS } from "./cms-workspace";

type Schemas = components["schemas"];

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const ARTWORK_GUIDANCE: Record<
  BannerTemplate["placement"],
  { dimensions: string; aspectClass: string; composition: string }
> = {
  homepage: {
    dimensions: "1440 × 800 px",
    aspectClass: "aspect-[9/5]",
    composition: "Keep the subject on the right with clear copy space on the left.",
  },
  homepage_ad: {
    dimensions: "960 × 540 px",
    aspectClass: "aspect-video",
    composition: "Use a text-free scene with the subject centred for the left media panel.",
  },
  financial_services: {
    dimensions: "1440 × 576 px",
    aspectClass: "aspect-[5/2]",
    composition:
      "Keep calm copy space on the left, let the scene enter the middle, and hold the focal subject on the right.",
  },
  properties: {
    dimensions: "1440 × 576 px",
    aspectClass: "aspect-[5/2]",
    composition:
      "Keep calm copy space on the left, let the property enter the middle, and hold its focus on the right.",
  },
  dashboard: {
    dimensions: "1440 × 800 px",
    aspectClass: "aspect-[9/5]",
    composition: "Keep important details away from the outer edges.",
  },
};

export function BannerTemplateManager() {
  const [open, setOpen] = React.useState(false);
  const [templates, setTemplates] = React.useState<BannerTemplate[]>([]);
  const [selectedId, setSelectedId] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [categoryError, setCategoryError] = React.useState<string>();
  const [fileError, setFileError] = React.useState<string>();
  const [loading, setLoading] = React.useState(false);

  const activeTemplates = React.useMemo(
    () => templates.filter((template) => template.active),
    [templates],
  );
  const selected = activeTemplates.find((template) => template.id === selectedId);
  const selectedGuidance = selected ? ARTWORK_GUIDANCE[selected.placement] : null;

  const load = React.useCallback(async () => {
    setLoading(true);
    const result = await listBannerTemplates(false);
    setLoading(false);
    if (result.ok) setTemplates(result.data);
    else toast.error("Could not load template versions", { description: result.error });
  }, []);

  React.useEffect(() => {
    if (open) void load();
  }, [load, open]);

  async function replaceTemplate() {
    setCategoryError(selected ? undefined : "Category is required.");
    setFileError(file ? undefined : "Replacement artwork is required.");
    if (!selected || !file) return;
    setLoading(true);
    const presign = await getBannerTemplateImageUploadUrl({
      content_type: file.type as Schemas["BannerImageUploadRequest"]["content_type"],
      filename: file.name,
    });
    if (!presign.ok) {
      setLoading(false);
      return void toast.error("Could not start the upload", { description: presign.error });
    }
    const upload = await uploadFileToPresignedPost(
      presign.data.upload_url,
      presign.data.fields,
      file,
    );
    if (!upload.ok) {
      setLoading(false);
      return void toast.error("Template upload failed.");
    }
    const result = await createBannerTemplateVersion({
      placement: selected.placement,
      category_key: selected.category_key,
      image_ref: presign.data.object_key,
      content_type: file.type as Schemas["BannerTemplateCreate"]["content_type"],
    });
    setLoading(false);
    if (!result.ok) {
      return void toast.error("Could not activate the new template", { description: result.error });
    }
    toast.success(`${selected.label} artwork updated`, {
      description: `Version ${result.data.version} is now used for new campaigns.`,
    });
    setFile(null);
    setSelectedId(result.data.id);
    await load();
  }

  return (
    <>
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--nav-tint)] text-brand-blue">
            <Layers3 className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-semibold text-text-primary">Artwork template library</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Admin controls the fixed category artwork; Sub Admin controls campaign copy.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setOpen(true)}>Manage templates</Button>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className={CMS_WORKSPACE_DIALOG_CLASS}>
          <CmsWorkspaceHeader
            title="Banner artwork templates"
            description="Replacing artwork creates a new immutable version; existing campaigns retain their reviewed version."
          />
          <div className="grid min-h-0 gap-6 overflow-y-auto py-3 lg:grid-cols-[minmax(20rem,0.8fr)_minmax(24rem,1.2fr)]">
            <section className="space-y-4 rounded-xl border border-border p-4">
              <div>
                <Label htmlFor="template-category">Category <RequiredIndicator /></Label>
                <Select value={selectedId || undefined} onValueChange={(value) => { setSelectedId(value); setCategoryError(undefined); }} disabled={loading}>
                  <SelectTrigger id="template-category" aria-required="true" aria-invalid={Boolean(categoryError)} aria-describedby={categoryError ? "template-category-error" : undefined}>
                    <SelectValue placeholder={loading ? "Loading…" : "Choose a template"} />
                  </SelectTrigger>
                  <SelectContent>
                    {activeTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.placement.replaceAll("_", " ")} · {template.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError id="template-category-error">{categoryError}</FieldError>
              </div>
              <FileField
                id="replacement-template-image"
                label="Replacement artwork"
                icon={ImageIcon}
                value={file}
                onChange={(value) => { setFile(value); setFileError(undefined); }}
                accept={IMAGE_ACCEPT}
                maxBytes={IMAGE_MAX_BYTES}
                error={fileError}
                hint={
                  selectedGuidance
                    ? `JPG, PNG or WEBP · ${selectedGuidance.dimensions}`
                    : "JPG, PNG or WEBP · choose a category for its dimensions"
                }
                disabled={loading}
              />
              <p className="text-xs leading-5 text-text-secondary">
                {selectedGuidance?.composition ??
                  "Artwork guidance changes with the selected public placement."}
              </p>
              <DialogFooter>
                <Button disabled={loading} onClick={() => void replaceTemplate()}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Create new version
                </Button>
              </DialogFooter>
            </section>

            <section aria-label="Current template versions" className="min-w-0 rounded-xl border border-border p-4">
              <h3 className="font-semibold text-text-primary">Current library</h3>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {activeTemplates.map((template) => (
                  <li key={template.id} className="overflow-hidden rounded-lg border border-border bg-card">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={template.image_url}
                      alt=""
                      width={1600}
                      height={600}
                      loading="lazy"
                      className={`${ARTWORK_GUIDANCE[template.placement].aspectClass} w-full object-cover`}
                    />
                    <div className="flex items-center justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{template.label}</p>
                        <p className="text-xs capitalize text-text-secondary">
                          {template.placement.replaceAll("_", " ")}
                        </p>
                        <p className="text-xs text-text-secondary">
                          {ARTWORK_GUIDANCE[template.placement].dimensions}
                        </p>
                      </div>
                      <Badge variant="outline">v{template.version}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
