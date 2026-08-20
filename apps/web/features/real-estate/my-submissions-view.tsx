"use client";

import * as React from "react";
import Link from "next/link";
import { Inbox, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import { DashboardHeader, DashboardPage, DashboardPanel, MetricCard, MetricGrid } from "@/features/dashboard/dashboard-ui";
import { formatPaiseCompact } from "@/lib/format";
import { withdrawSubmission, type Submission } from "@/lib/property-submissions-api";
import { useMySubmissions } from "./use-my-submissions";

const STATUS_VARIANT: Record<Submission["status"], "secondary" | "default" | "destructive"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  withdrawn: "secondary",
};
const STATUS_LABEL: Record<Submission["status"], string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export function MySubmissionsView() {
  const { items, loading, error, reload } = useMySubmissions();
  const [withdrawing, setWithdrawing] = React.useState<Submission | null>(null);
  const [busy, setBusy] = React.useState(false);
  const pendingCount = items.filter((item) => item.status === "pending").length;
  const approvedCount = items.filter((item) => item.status === "approved").length;
  const rejectedCount = items.filter((item) => item.status === "rejected").length;

  async function confirmWithdraw() {
    if (!withdrawing) return;
    setBusy(true);
    const result = await withdrawSubmission(withdrawing.id);
    setBusy(false);
    if (result.ok) {
      toast.success("Listing withdrawn", {
        description: "The listing is no longer public and cannot be edited.",
      });
      setWithdrawing(null);
      void reload();
    } else {
      toast.error("Could not withdraw listing", { description: result.error });
    }
  }

  return (
    <DashboardPage>
      <DashboardHeader
        eyebrow="Real Estate listings"
        title="My listings"
        description="Track every property submitted for review and see the latest approval state."
        actions={<Button asChild size="sm"><Link href="/dashboard/property-submit">New listing</Link></Button>}
      />

      {loading && (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-text-secondary">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void reload()}>Try again</Button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Inbox className="mx-auto h-8 w-8 text-text-secondary" aria-hidden="true" />
          <p className="mt-3 text-sm text-text-secondary">No submissions yet.</p>
          <Button asChild size="sm" className="mt-4"><Link href="/dashboard/property-submit">Submit your first listing</Link></Button>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <>
        <MetricGrid>
          <MetricCard label="All listings" value={items.length} icon={DASHBOARD_ICONS.propertyListings} />
          <MetricCard label="Pending review" value={pendingCount} icon={DASHBOARD_ICONS.listingApprovals} attention={pendingCount > 0} />
          <MetricCard label="Approved" value={approvedCount} icon={DASHBOARD_ICONS.listingApprovals} />
          <MetricCard label="Rejected" value={rejectedCount} icon={DASHBOARD_ICONS.propertyListings} attention={rejectedCount > 0} />
        </MetricGrid>
        <DashboardPanel title="Submission history" description="Media counts, review state, and reviewer feedback for your listings.">
        <ul className="divide-y divide-border">
          {items.map((s) => (
            <li key={s.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-text-primary">{s.title}</p>
                  <p className="text-sm text-text-secondary">{s.location}</p>
                  <p className="mt-1 text-sm font-medium text-text-primary">{formatPaiseCompact(s.price_paise)}</p>
                  <p className="mt-1 text-xs text-text-secondary">
                    {(s.media ?? []).filter((asset) => asset.kind === "image").length} images
                    {(s.media ?? []).some((asset) => asset.kind === "document")
                      ? ` · ${(s.media ?? []).filter((asset) => asset.kind === "document").length} private documents`
                      : ""}
                  </p>
                  {(s.media ?? []).some((asset) => asset.kind === "panorama") ? (
                    <p className="mt-1 text-xs text-text-secondary">
                      360° panorama included
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-text-secondary">
                    Submitted{" "}
                    {new Date(s.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[s.status]}>{STATUS_LABEL[s.status]}</Badge>
              </div>
              {s.status === "rejected" && s.review_note && (
                <p className="mt-2 rounded bg-destructive/5 p-2 text-sm text-text-secondary">
                  Reviewer note: {s.review_note}
                </p>
              )}
              {s.status !== "withdrawn" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/my-submissions/${s.id}/edit`}>
                      <Pencil className="h-4 w-4" aria-hidden /> Edit
                    </Link>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setWithdrawing(s)}>
                    <Trash2 className="h-4 w-4" aria-hidden /> Withdraw
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        </DashboardPanel>
        </>
      )}
      <Dialog open={withdrawing !== null} onOpenChange={(open) => !open && !busy && setWithdrawing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw this listing?</DialogTitle>
            <DialogDescription>
              {withdrawing?.title} will be removed from the public catalogue. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setWithdrawing(null)}>
              Keep listing
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void confirmWithdraw()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
              Withdraw listing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardPage>
  );
}
