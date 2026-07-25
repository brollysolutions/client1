"use client";

import * as React from "react";
import Link from "next/link";
import { Archive, Globe, Inbox, Loader2, Plus, Send } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  archiveContentBlock,
  publishContentBlock,
  updateContentBlock,
  type ContentBlock,
} from "@/lib/content-api";
import { useContentQueue } from "./use-content-queue";

const STATUS_LABEL: Record<ContentBlock["status"], string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

const STATUS_VARIANT: Record<ContentBlock["status"], "secondary" | "outline"> = {
  draft: "outline",
  published: "secondary",
  archived: "outline",
};

const LINE_LABEL: Record<string, string> = {
  loans: "Loans",
  real_estate: "Real Estate",
  both: "Both lines",
};

// Published copy stays editable in place. There is no approval gate on content,
// so a typo fix on a live block should not need an archive-and-recreate round trip.
const EDITABLE_STATUSES = new Set<ContentBlock["status"]>(["draft", "published"]);

function lineText(block: ContentBlock): string {
  return block.business_line ? (LINE_LABEL[block.business_line] ?? block.business_line) : "Global";
}

export function ContentView() {
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";
  const { items, loading, error, reload } = useContentQueue();
  const [active, setActive] = React.useState<ContentBlock | null>(null);
  const [draftTitle, setDraftTitle] = React.useState("");
  const [draftSection, setDraftSection] = React.useState("");
  const [draftBody, setDraftBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function openBlock(block: ContentBlock) {
    setActive(block);
    setDraftTitle(block.title);
    setDraftSection(block.section);
    setDraftBody(block.body ?? "");
  }

  async function onSaveEdit(block: ContentBlock) {
    if (draftTitle.trim().length === 0) {
      toast.error("Title can't be empty");
      return;
    }
    if (draftSection.trim().length === 0) {
      toast.error("Section can't be empty");
      return;
    }
    if (block.status === "published" && draftBody.trim().length === 0) {
      toast.error("A published block needs a body");
      return;
    }
    setBusy(true);
    const res = await updateContentBlock(block.id, {
      title: draftTitle.trim(),
      section: draftSection.trim(),
      body: draftBody.trim() || null,
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Content updated");
      setActive(res.data);
      void reload();
    } else {
      toast.error("Could not update content block", { description: res.error });
    }
  }

  async function onAdvance(
    action: typeof publishContentBlock,
    block: ContentBlock,
    successMsg: string,
  ) {
    setBusy(true);
    const res = await action(block.id);
    setBusy(false);
    if (res.ok) {
      toast.success(successMsg);
      setActive(null);
      void reload();
    } else {
      toast.error("Could not update content block", { description: res.error });
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Website content</h1>
          <p className="text-sm text-text-secondary">
            {isAdmin
              ? "Read-only view of every content block the content team manages."
              : "Write website copy, publish it, and archive what is no longer needed."}
          </p>
        </div>
        {!isAdmin ? (
          <Link href="/dashboard/content/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              New block
            </Button>
          </Link>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border bg-card py-16">
          <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-text-secondary">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
          <Inbox className="h-8 w-8 text-text-secondary" aria-hidden="true" />
          <p className="mt-3 font-medium text-text-primary">No content blocks yet</p>
          <p className="mt-1 text-sm text-text-secondary">
            {isAdmin
              ? "Blocks the content team writes will show up here."
              : "Write your first block of website copy to get started."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((block) => (
            <li key={block.id}>
              <button
                type="button"
                onClick={() => openBlock(block)}
                className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-brand-cta"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-primary">{block.title}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-text-secondary">
                    {block.business_line === null ? (
                      <Globe className="h-3 w-3 shrink-0" aria-hidden="true" />
                    ) : null}
                    <span className="truncate">
                      {block.section} · {lineText(block)}
                    </span>
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[block.status]} className="shrink-0">
                  {STATUS_LABEL[block.status]}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-lg">
          {active ? (
            <>
              <DialogHeader>
                <DialogTitle>{active.title}</DialogTitle>
                <DialogDescription>
                  {STATUS_LABEL[active.status]} · {lineText(active)} · /{active.slug}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {!isAdmin && EDITABLE_STATUSES.has(active.status) ? (
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="edit-title">Title</Label>
                      <Input
                        id="edit-title"
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        maxLength={500}
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-section">Section</Label>
                      <Input
                        id="edit-section"
                        value={draftSection}
                        onChange={(e) => setDraftSection(e.target.value)}
                        maxLength={200}
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-body">Body</Label>
                      <Textarea
                        id="edit-body"
                        value={draftBody}
                        onChange={(e) => setDraftBody(e.target.value)}
                        maxLength={50000}
                        rows={8}
                      />
                    </div>
                  </div>
                ) : (
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="text-text-secondary">Section</dt>
                      <dd className="font-medium text-text-primary">{active.section}</dd>
                    </div>
                    <div>
                      <dt className="text-text-secondary">Body</dt>
                      <dd className="whitespace-pre-wrap font-medium text-text-primary">
                        {active.body ?? "No copy written yet."}
                      </dd>
                    </div>
                  </dl>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                {!isAdmin && EDITABLE_STATUSES.has(active.status) ? (
                  <Button variant="outline" onClick={() => void onSaveEdit(active)} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save
                  </Button>
                ) : null}
                {!isAdmin && active.status !== "archived" ? (
                  <Button
                    variant="outline"
                    onClick={() => void onAdvance(archiveContentBlock, active, "Content archived")}
                    disabled={busy}
                  >
                    <Archive className="h-4 w-4" />
                    Archive
                  </Button>
                ) : null}
                {!isAdmin && active.status === "draft" ? (
                  <Button
                    onClick={() => void onAdvance(publishContentBlock, active, "Content published")}
                    disabled={busy}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Publish
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
