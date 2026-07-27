"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { createBanner } from "@/lib/banners-api";

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
  const [imageKey, setImageKey] = React.useState("");
  const [deepLink, setDeepLink] = React.useState("");
  const [priority, setPriority] = React.useState("0");
  const [titleError, setTitleError] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length === 0) {
      setTitleError("Title is required.");
      return;
    }
    setTitleError(undefined);
    setSubmitting(true);
    const res = await createBanner({
      business_line: businessLine,
      banner_type: bannerType,
      title: title.trim(),
      subtitle: subtitle.trim() || null,
      cta_label: ctaLabel.trim() || null,
      image_key: imageKey.trim() || null,
      deep_link: deepLink.trim() || null,
      audience_rules: {},
      priority: Number(priority) || 0,
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="image-key">Image key</Label>
            <Input
              id="image-key"
              placeholder="uploaded asset reference"
              value={imageKey}
              onChange={(e) => setImageKey(e.target.value)}
              maxLength={500}
            />
          </div>
          <div>
            <Label htmlFor="priority">Priority</Label>
            <Input
              id="priority"
              inputMode="numeric"
              value={priority}
              onChange={(e) => setPriority(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        </div>

        <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save draft
        </Button>
      </form>
    </div>
  );
}
