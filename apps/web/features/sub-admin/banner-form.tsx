"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { components } from "@contracts/generated/schema";

import { FileField } from "@/components/apply-as-agent/file-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { uploadFileToPresignedPost } from "@/lib/agent-application";
import { createBanner, getBannerImageUploadUrl } from "@/lib/banners-api";

type Schemas = components["schemas"];

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

const LINE_OPTIONS = [
  { value: "loans", label: "Loans" },
  { value: "real_estate", label: "Real Estate" },
  { value: "both", label: "Both lines" },
] as const;

const TYPE_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "personalized", label: "Personalized" },
  { value: "action", label: "Action" },
] as const;

export function BannerForm() {
  const router = useRouter();
  const [businessLine, setBusinessLine] = React.useState<(typeof LINE_OPTIONS)[number]["value"]>(
    "loans",
  );
  const [bannerType, setBannerType] =
    React.useState<(typeof TYPE_OPTIONS)[number]["value"]>("default");
  const [title, setTitle] = React.useState("");
  const [subtitle, setSubtitle] = React.useState("");
  const [ctaLabel, setCtaLabel] = React.useState("");
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [imageKey, setImageKey] = React.useState<string | null>(null);
  const [imageUploading, setImageUploading] = React.useState(false);
  const [imageError, setImageError] = React.useState<string | undefined>();
  const [deepLink, setDeepLink] = React.useState("");
  const [priority, setPriority] = React.useState("0");
  const [startsAt, setStartsAt] = React.useState("");
  const [endsAt, setEndsAt] = React.useState("");
  const [titleError, setTitleError] = React.useState<string | undefined>();
  const [scheduleError, setScheduleError] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);

  // Uploads immediately on pick (presign -> direct-to-storage POST), not
  // deferred to form submit: the banner row is saved with whatever image_key
  // this resolves to, so the object needs to already exist in storage by
  // then. A pick that fails leaves the tile empty rather than silently
  // keeping a stale key.
  async function handleImageChange(file: File | null) {
    setImageFile(file);
    setImageKey(null);
    setImageError(undefined);
    if (!file) return;
    setImageUploading(true);
    const presignRes = await getBannerImageUploadUrl({
      content_type: file.type as Schemas["BannerImageUploadRequest"]["content_type"],
      filename: file.name,
    });
    if (!presignRes.ok) {
      setImageUploading(false);
      setImageError(presignRes.error || "Could not start the upload.");
      setImageFile(null);
      return;
    }
    const { object_key, upload_url, fields } = presignRes.data;
    const uploadRes = await uploadFileToPresignedPost(upload_url, fields, file);
    setImageUploading(false);
    if (!uploadRes.ok) {
      setImageError("Upload failed. Try again.");
      setImageFile(null);
      return;
    }
    setImageKey(object_key);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length === 0) {
      setTitleError("Title is required.");
      return;
    }
    setTitleError(undefined);
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      setScheduleError("End must be after start.");
      return;
    }
    setScheduleError(undefined);
    setSubmitting(true);
    const res = await createBanner({
      business_line: businessLine,
      banner_type: bannerType,
      title: title.trim(),
      subtitle: subtitle.trim() || null,
      cta_label: ctaLabel.trim() || null,
      image_key: imageKey,
      deep_link: deepLink.trim() || null,
      audience_rules: {},
      priority: Number(priority) || 0,
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    });
    setSubmitting(false);
    if (res.ok) {
      toast.success("Banner draft created", {
        description: "Submit it for Admin approval when you're ready.",
      });
      router.push("/dashboard/banners");
    } else {
      toast.error("Could not create banner", { description: res.error });
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">New banner</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Saved as a draft first. Submit it once you&apos;re happy, and it goes to Admin for
          approval before going live.
        </p>
      </div>

      <form className="space-y-6" onSubmit={onSubmit}>
        <div>
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={500}
          />
          {titleError ? <p className="mt-1 text-sm text-destructive">{titleError}</p> : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="business-line">Line</Label>
            <Select
              value={businessLine}
              onValueChange={(v) => setBusinessLine(v as typeof businessLine)}
            >
              <SelectTrigger id="business-line">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LINE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="banner-type">Type</Label>
            <Select value={bannerType} onValueChange={(v) => setBannerType(v as typeof bannerType)}>
              <SelectTrigger id="banner-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="subtitle">Subtitle</Label>
          <Input
            id="subtitle"
            placeholder="A short line under the title"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            maxLength={300}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="cta-label">Button label</Label>
            <Input
              id="cta-label"
              placeholder="Learn more"
              value={ctaLabel}
              onChange={(e) => setCtaLabel(e.target.value)}
              maxLength={40}
            />
          </div>
          <div>
            <Label htmlFor="deep-link">Deep link</Label>
            <Input
              id="deep-link"
              placeholder="/loans"
              value={deepLink}
              onChange={(e) => setDeepLink(e.target.value)}
              maxLength={1000}
            />
          </div>
        </div>
        <p className="-mt-3 text-xs text-text-secondary">
          The button label and deep link together become the banner&apos;s call to action. Use a
          path starting with a single / to link within the site. An external link (including one
          starting with //) will not show a button on the public homepage.
        </p>

        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <FileField
            id="banner-image"
            label="Image"
            icon={ImageIcon}
            value={imageFile}
            onChange={handleImageChange}
            accept={IMAGE_ACCEPT}
            maxBytes={IMAGE_MAX_BYTES}
            hint="JPG, PNG or WEBP"
            error={imageError}
            disabled={imageUploading}
          />
          <div>
            <Label htmlFor="priority">Priority</Label>
            <Input
              id="priority"
              inputMode="numeric"
              value={priority}
              onChange={(e) => setPriority(e.target.value.replace(/\D/g, ""))}
            />
            <p className="mt-2 text-xs text-text-secondary">
              {imageUploading
                ? "Uploading the image..."
                : "Optional. Shows as the banner's background image on the public homepage."}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="starts-at">Goes live at</Label>
            <Input
              id="starts-at"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ends-at">Archives at</Label>
            <Input
              id="ends-at"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </div>
        </div>
        <p className="-mt-3 text-xs text-text-secondary">
          Leave both blank to go live on the next scheduler tick after Admin approval and never
          auto-archive.
        </p>
        {scheduleError ? <p className="text-sm text-destructive">{scheduleError}</p> : null}

        <Button
          type="submit"
          disabled={submitting || imageUploading}
          className="w-full sm:w-auto"
        >
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save draft
        </Button>
      </form>
    </div>
  );
}
