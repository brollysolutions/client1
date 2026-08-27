"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
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
import { apiIssuesToFieldErrors, focusFirstInvalidField } from "@/lib/form-validation";
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
  const formRef = React.useRef<HTMLFormElement>(null);
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

    if (hasError) {
      requestAnimationFrame(() => {
        if (formRef.current) focusFirstInvalidField(formRef.current);
      });
      return;
    }

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
      const serverErrors = apiIssuesToFieldErrors(res.issues, {
        slug: "slug",
        section: "section",
        title: "title",
      });
      if (serverErrors.slug) setSlugError(serverErrors.slug);
      if (serverErrors.section) setSectionError(serverErrors.section);
      if (serverErrors.title) setTitleError(serverErrors.title);
      toast.error("Could not create content block", { description: res.error });
    }
  }

  return (
    <DashboardFormPage
      title="New content block"
      description="Create reusable website copy with an explicit placement and business-line scope."
      backHref="/dashboard/content"
      backLabel="Back to content"
      formTitle="Content configuration"
      formDescription="The block is saved as a draft until it is ready to publish."
      embedded={embedded}
      aside={<><ContentGuideCard /><CmsPreviewFrame title="Public content preview" description="The generic public content-section presentation for this draft." device={previewDevice} onDeviceChange={setPreviewDevice}><ContentPreview block={{ title, body: body || null }} /></CmsPreviewFrame></>}
    >
      <form ref={formRef} className="space-y-6" onSubmit={onSubmit} noValidate>
        <DashboardFormSection
          title="Placement"
          description="Define the internal key, website section, and audience line before writing the copy."
        >
          <div>
            <Label htmlFor="title">Title<RequiredIndicator /></Label>
            <Input
              id="title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setTitleError(undefined);
                if (slug.length === 0 || slug === slugify(title)) {
                  setSlug(slugify(event.target.value));
                }
              }}
              maxLength={500}
              aria-invalid={Boolean(titleError)}
              aria-describedby={titleError ? "title-error" : undefined}
            />
            <FieldError id="title-error" className="mt-1">{titleError}</FieldError>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="slug">Slug<RequiredIndicator /></Label>
              <Input
                id="slug"
                value={slug}
                onChange={(event) => { setSlug(event.target.value.toLowerCase()); setSlugError(undefined); }}
                maxLength={200}
                placeholder="homepage-hero-copy"
                aria-invalid={Boolean(slugError)}
                aria-describedby={["slug-help", slugError ? "slug-error" : undefined].filter(Boolean).join(" ")}
              />
              <p id="slug-help" className="mt-1 text-xs text-text-secondary">
                Immutable key used by the website to locate this block.
              </p>
              <FieldError id="slug-error" className="mt-1">{slugError}</FieldError>
            </div>
            <div>
              <Label htmlFor="section">Section<RequiredIndicator /></Label>
              <Input
                id="section"
                value={section}
                onChange={(event) => { setSection(event.target.value); setSectionError(undefined); }}
                maxLength={200}
                placeholder="homepage-hero"
                aria-invalid={Boolean(sectionError)}
                aria-describedby={["section-help", sectionError ? "section-error" : undefined].filter(Boolean).join(" ")}
              />
              <p id="section-help" className="mt-1 text-xs text-text-secondary">
                Identifies where this block appears.
              </p>
              <FieldError id="section-error" className="mt-1">{sectionError}</FieldError>
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
