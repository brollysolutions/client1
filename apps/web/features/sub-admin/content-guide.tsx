"use client";

import * as React from "react";
import { BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

import { CmsWorkspaceHeader, CMS_WORKSPACE_DIALOG_CLASS } from "./cms-workspace";

export function ContentGuideButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}><BookOpen className="h-4 w-4" />Content guide</Button>
      <DialogContent showCloseButton={false} className={CMS_WORKSPACE_DIALOG_CLASS}>
        <CmsWorkspaceHeader title="Website content guide" description="How to create, preview, publish, update, and retire reusable website copy." />
        <Guide />
      </DialogContent>
    </Dialog>
  );
}

export function ContentGuideCard() {
  return <aside className="space-y-3 rounded-xl border border-border bg-card p-4"><div className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-brand-cta" /><h2 className="font-semibold text-text-primary">Before you publish</h2></div><p className="text-sm leading-6 text-text-secondary">Use a stable placement key, choose the narrowest correct line, preview the complete body, and confirm that the page already consumes that slug.</p><ContentGuideButton /></aside>;
}

function Guide() {
  return (
    <div className="min-h-0 overflow-y-auto py-2">
      <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-2">
        <GuideSection title="1. Choose the placement"><p><strong>Slug</strong> is the immutable lookup key used by the website. <strong>Section</strong> is the human-readable placement label. Creating a new slug does not automatically add it to a page; the page must already consume that key.</p></GuideSection>
        <GuideSection title="2. Choose the line"><p><strong>Global</strong> copy is available across the site. Loans or Real Estate limits the block to that journey. Use the narrowest scope that matches the intended page.</p></GuideSection>
        <GuideSection title="3. Draft and preview"><p>Write a clear title and plain-text body. The preview mirrors the public content section. Empty bodies are intentionally hidden on the public site.</p></GuideSection>
        <GuideSection title="4. Publish safely"><p>Save the draft, check spelling and line scope, preview desktop and mobile widths, then publish. Published blocks can be corrected in place; changes appear wherever the slug is consumed.</p></GuideSection>
        <GuideSection title="5. Update or archive"><p>Open a record from the list to edit its title, section, or body. Archive obsolete copy instead of leaving stale published content. An archived block no longer appears publicly.</p></GuideSection>
        <GuideSection title="Pre-publish checklist"><ul className="list-disc space-y-1 pl-5"><li>The slug matches an existing website placement.</li><li>The business line is correct.</li><li>The body is complete and contains no private data.</li><li>Desktop and mobile previews are readable.</li><li>Links or HTML are not pasted into the plain-text body.</li></ul></GuideSection>
      </div>
    </div>
  );
}

function GuideSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-xl border border-border bg-card p-5"><h2 className="font-semibold text-text-primary">{title}</h2><div className="mt-2 text-sm leading-6 text-text-secondary">{children}</div></section>; }
