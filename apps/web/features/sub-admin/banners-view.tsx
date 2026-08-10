"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, ImageOff, Inbox, Loader2, Plus, XCircle } from "lucide-react";
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
  approveBanner,
  rejectBanner,
  submitBanner,
  updateBanner,
  type Banner,
} from "@/lib/banners-api";
import { useBannerQueue } from "./use-banner-queue";
import { audienceSummary } from "./audience-rule-fields";

const STATUS_LABEL: Record<Banner["status"], string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  live: "Live",
  rejected: "Rejected",
  archived: "Archived",
};

const STATUS_VARIANT: Record<Banner["status"], "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  pending_approval: "secondary",
  approved: "secondary",
  live: "secondary",
  rejected: "destructive",
  archived: "outline",
};

const EDITABLE_STATUSES = new Set<Banner["status"]>(["draft", "rejected"]);

export function BannersView() {
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";
  const { items, loading, error, reload } = useBannerQueue();
  const [active, setActive] = React.useState<Banner | null>(null);
  const [rejecting, setRejecting] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [draftTitle, setDraftTitle] = React.useState("");
  const [draftDeepLink, setDraftDeepLink] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function openBanner(banner: Banner) {
    setActive(banner);
    setRejecting(false);
    setNote("");
    setDraftTitle(banner.title);
    setDraftDeepLink(banner.deep_link ?? "");
  }

  async function onSaveEdit(banner: Banner) {
    if (draftTitle.trim().length === 0) {
      toast.error("Title can't be empty");
      return;
    }
    setBusy(true);
    const res = await updateBanner(banner.id, {
      title: draftTitle.trim(),
      deep_link: draftDeepLink.trim() || null,
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Banner updated");
      setActive(res.data);
      void reload();
    } else {
      toast.error("Could not update banner", { description: res.error });
    }
  }

  async function onSubmitForReview(banner: Banner) {
    setBusy(true);
    const res = await submitBanner(banner.id);
    setBusy(false);
    if (res.ok) {
      toast.success("Submitted for approval");
      setActive(null);
      void reload();
    } else {
      toast.error("Could not submit", { description: res.error });
    }
  }

  async function onApprove(banner: Banner) {
    setBusy(true);
    const res = await approveBanner(banner.id);
    setBusy(false);
    if (res.ok) {
      toast.success("Banner approved");
      setActive(null);
      void reload();
    } else {
      toast.error("Could not approve", { description: res.error });
    }
  }

  async function onReject(banner: Banner) {
    if (note.trim().length === 0) {
      toast.error("Add a reason", { description: "Tell the Sub Admin why this was rejected." });
      return;
    }
    setBusy(true);
    const res = await rejectBanner(banner.id, note.trim());
    setBusy(false);
    if (res.ok) {
      toast.success("Banner rejected");
      setActive(null);
      setRejecting(false);
      setNote("");
      void reload();
    } else {
      toast.error("Could not reject", { description: res.error });
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Banners</h1>
          <p className="text-sm text-text-secondary">
            Create banner drafts, correct editable records, and review submitted work.
          </p>
        </div>
        <Link href="/dashboard/banners/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            New banner
          </Button>
        </Link>
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
          <p className="mt-3 font-medium text-text-primary">No banners yet</p>
          <p className="mt-1 text-sm text-text-secondary">
            Create your first banner draft to get started.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((banner) => (
            <li key={banner.id}>
              <button
                type="button"
                onClick={() => openBanner(banner)}
                className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-brand-cta"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-primary">{banner.title}</p>
                  <p className="mt-0.5 truncate text-xs text-text-secondary">
                    {banner.business_line === "both" ? "Both lines" : banner.business_line} ·{" "}
                    {audienceSummary(banner.audience_rules)}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[banner.status]} className="shrink-0">
                  {STATUS_LABEL[banner.status]}
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
                  {STATUS_LABEL[active.status]} ·{" "}
                  {active.business_line === "both" ? "Both lines" : active.business_line}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {active.image_key ? (
                  <div className="flex h-32 w-full items-center justify-center rounded-xl bg-muted">
                    <p className="truncate px-4 text-xs text-text-secondary">{active.image_key}</p>
                  </div>
                ) : (
                  <div className="flex h-32 w-full items-center justify-center rounded-xl bg-muted">
                    <ImageOff className="h-6 w-6 text-text-secondary" aria-hidden="true" />
                  </div>
                )}

                {EDITABLE_STATUSES.has(active.status) ? (
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
                      <Label htmlFor="edit-deep-link">Deep link</Label>
                      <Input
                        id="edit-deep-link"
                        value={draftDeepLink}
                        onChange={(e) => setDraftDeepLink(e.target.value)}
                        maxLength={1000}
                      />
                    </div>
                    {active.status === "rejected" && active.review_note ? (
                      <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                        Rejected: {active.review_note}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <dt className="text-text-secondary">Priority</dt>
                      <dd className="font-medium text-text-primary">{active.priority}</dd>
                    </div>
                    <div>
                      <dt className="text-text-secondary">Type</dt>
                      <dd className="font-medium text-text-primary">{active.banner_type}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-text-secondary">Audience</dt>
                      <dd className="font-medium text-text-primary">
                        {audienceSummary(active.audience_rules)}
                      </dd>
                    </div>
                    {active.review_note ? (
                      <div className="col-span-2">
                        <dt className="text-text-secondary">Review note</dt>
                        <dd className="font-medium text-text-primary">{active.review_note}</dd>
                      </div>
                    ) : null}
                  </dl>
                )}

                {rejecting ? (
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Reason for rejection (shown to the Sub Admin)"
                    rows={3}
                  />
                ) : null}
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                {isAdmin && active.status === "pending_approval" ? (
                  rejecting ? (
                    <>
                      <Button variant="ghost" onClick={() => setRejecting(false)} disabled={busy}>
                        Back
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => void onReject(active)}
                        disabled={busy}
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        Confirm reject
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" onClick={() => setRejecting(true)} disabled={busy}>
                        Reject
                      </Button>
                      <Button onClick={() => void onApprove(active)} disabled={busy}>
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Approve
                      </Button>
                    </>
                  )
                ) : EDITABLE_STATUSES.has(active.status) ? (
                  <>
                    <Button variant="outline" onClick={() => void onSaveEdit(active)} disabled={busy}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Save
                    </Button>
                    <Button onClick={() => void onSubmitForReview(active)} disabled={busy}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Submit for approval
                    </Button>
                  </>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
