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
import { Textarea } from "@/components/ui/textarea";
import {
  DashboardFormPage,
  DashboardFormSection,
} from "@/features/dashboard/dashboard-ui";
import { createContentBlock } from "@/lib/content-api";
import { ContentGuideCard } from "./content-guide";
import { ContentPreview } from "./cms-previews";
import { CmsPreviewFrame, type PreviewDevice } from "./cms-workspace";

// "global" is a UI-only sentinel. The API models cross-line content as a null
// business_line, but a Select needs a non-empty string value.
const GLOBAL = "global";

const LINE_OPTIONS = [
  { value: GLOBAL, label: "All lines (global)" },
  { value: "loans", label: "Loans" },
  { value: "real_estate", label: "Real Estate" },
  { value: "both", label: "Both lines" },
] as const;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Mirrors the server's slug rule so the user sees the problem before submitting.
function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function ContentForm({ embedded = false, onCreated, onDirtyChange }: { embedded?: boolean; onCreated?: () => void; onDirtyChange?: (dirty: boolean) => void } = {}) {
  const router = useRouter();
  const [businessLine, setBusinessLine] =
    React.useState<(typeof LINE_OPTIONS)[number]["value"]>(GLOBAL);
  const [slug, setSlug] = React.useState("");
  const [section, setSection] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [slugError, setSlugError] = React.useState<string | undefined>();
  const [sectionError, setSectionError] = React.useState<string | undefined>();
  const [titleError, setTitleError] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);
  const [previewDevice, setPreviewDevice] = React.useState<PreviewDevice>("desktop");
  const dirty = Boolean(slug || section || title || body || businessLine !== GLOBAL);
  React.useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    let hasError = false;

    const cleanSlug = slug.trim();
    if (cleanSlug.length === 0) {
      setSlugError("A slug is required.");
      hasError = true;
    } else if (!SLUG_PATTERN.test(cleanSlug)) {
      setSlugError("Use lowercase letters, numbers, and single hyphens only.");
      hasError = true;
    } else {
      setSlugError(undefined);
    }

    if (section.trim().length === 0) {
      setSectionError("A section is required.");
      hasError = true;
    } else {
      setSectionError(undefined);
    }

    if (title.trim().length === 0) {
      setTitleError("Title is required.");
      hasError = true;
    } else {
      setTitleError(undefined);
    }

    if (hasError) return;

    setSubmitting(true);
    const res = await createContentBlock({
      slug: cleanSlug,
      section: section.trim(),
      title: title.trim(),
      body: body.trim() || null,
      business_line: businessLine === GLOBAL ? null : businessLine,
    });
    setSubmitting(false);
    if (res.ok) {
      toast.success("Content draft created", {
        description: "Publish it whenever the copy is ready.",
      });
      if (onCreated) onCreated();
      else router.push("/dashboard/content");
    } else if (res.status === 409) {
      setSlugError("That slug is already taken. Pick another one.");
      toast.error("Slug already in use");
    } else {
      toast.error("Could not create content block", { description: res.error });
    }
  }

  return (
    <DashboardFormPage
      eyebrow="Website content"
      title="New content block"
      description="Create reusable website copy with an explicit placement and business-line scope."
      backHref="/dashboard/content"
      backLabel="Back to content"
      formTitle="Content configuration"
      formDescription="The block is saved as a draft until it is ready to publish."
      embedded={embedded}
      aside={<><ContentGuideCard /><CmsPreviewFrame title="Public content preview" description="The generic public content-section presentation for this draft." device={previewDevice} onDeviceChange={setPreviewDevice}><ContentPreview block={{ title, body: body || null }} /></CmsPreviewFrame></>}
    >
      <form className="space-y-6" onSubmit={onSubmit}>
        <DashboardFormSection
          title="Placement"
          description="Define the internal key, website section, and audience line before writing the copy."
        >
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (slug.length === 0 || slug === slugify(title)) {
                  setSlug(slugify(event.target.value));
                }
              }}
              maxLength={500}
            />
            {titleError ? <p className="mt-1 text-sm text-destructive">{titleError}</p> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(event) => setSlug(event.target.value.toLowerCase())}
                maxLength={200}
                placeholder="homepage-hero-copy"
              />
              <p className="mt-1 text-xs text-text-secondary">
                Immutable key used by the website to locate this block.
              </p>
              {slugError ? <p className="mt-1 text-sm text-destructive">{slugError}</p> : null}
            </div>
            <div>
              <Label htmlFor="section">Section</Label>
              <Input
                id="section"
                value={section}
                onChange={(event) => setSection(event.target.value)}
                maxLength={200}
                placeholder="homepage-hero"
              />
              <p className="mt-1 text-xs text-text-secondary">
                Identifies where this block appears.
              </p>
              {sectionError ? (
                <p className="mt-1 text-sm text-destructive">{sectionError}</p>
              ) : null}
            </div>
          </div>

          <div>
            <Label htmlFor="business-line">Line</Label>
            <Select
              value={businessLine}
              onValueChange={(value) => setBusinessLine(value as typeof businessLine)}
            >
              <SelectTrigger id="business-line">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LINE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-text-secondary">
              Global content shows on pages for both lines. This cannot be changed later.
            </p>
          </div>
        </DashboardFormSection>

        <DashboardFormSection
          title="Copy"
          description="Draft the body now or leave it empty and complete it before publishing."
        >
          <div>
            <Label htmlFor="body">Body</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={50000}
              rows={12}
              placeholder="Write the copy here."
            />
            <p className="mt-1 text-xs text-text-secondary">
              A block needs a body before it can be published.
            </p>
          </div>
        </DashboardFormSection>

        <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {submitting ? "Saving draft…" : "Save draft"}
        </Button>
      </form>
    </DashboardFormPage>
  );
}
