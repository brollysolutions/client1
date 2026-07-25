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
import { createContentBlock } from "@/lib/content-api";

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

export function ContentForm() {
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
      router.push("/dashboard/content");
    } else if (res.status === 409) {
      setSlugError("That slug is already taken. Pick another one.");
      toast.error("Slug already in use");
    } else {
      toast.error("Could not create content block", { description: res.error });
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">New content block</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Saved as a draft first. Publish it when the copy is ready to go live.
        </p>
      </div>

      <form className="space-y-6" onSubmit={onSubmit}>
        <div>
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              // Fill the slug from the title until the user edits it directly.
              if (slug.length === 0 || slug === slugify(title)) setSlug(slugify(e.target.value));
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
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              maxLength={200}
              placeholder="homepage-hero-copy"
            />
            <p className="mt-1 text-xs text-text-secondary">
              The key the website uses to find this block. It cannot be changed later.
            </p>
            {slugError ? <p className="mt-1 text-sm text-destructive">{slugError}</p> : null}
          </div>
          <div>
            <Label htmlFor="section">Section</Label>
            <Input
              id="section"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              maxLength={200}
              placeholder="homepage-hero"
            />
            <p className="mt-1 text-xs text-text-secondary">
              Where this block appears on the site.
            </p>
            {sectionError ? <p className="mt-1 text-sm text-destructive">{sectionError}</p> : null}
          </div>
        </div>

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
          <p className="mt-1 text-xs text-text-secondary">
            Global content shows on pages for both lines. This cannot be changed later.
          </p>
        </div>

        <div>
          <Label htmlFor="body">Body</Label>
          <Textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={50000}
            rows={10}
            placeholder="Write the copy here. You can leave this empty and fill it in later."
          />
          <p className="mt-1 text-xs text-text-secondary">
            A block needs a body before it can be published.
          </p>
        </div>

        <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save draft
        </Button>
      </form>
    </div>
  );
}
