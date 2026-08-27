"use client";

import * as React from "react";
import Link from "next/link";
import { Inbox, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import {
  DashboardHeader,
  DashboardPage,
  DashboardPanel,
  MetricCard,
  MetricGrid,
} from "@/features/dashboard/dashboard-ui";
import { DataTable, DataTablePrimaryCell, type DataColumn } from "@/features/dashboard/data-table";
import { FetchError } from "@/features/dashboard/fetch-error";
import { ListEmptyState, ListLoadingState, ListPagination } from "@/features/dashboard/list-states";
import { StatusBadge, type StatusTone } from "@/features/dashboard/status-badge";
import { useFilteredPage } from "@/features/dashboard/use-filtered-page";
import { formatPaiseCompact } from "@/lib/format";
import { withdrawSubmission, type Submission } from "@/lib/property-submissions-api";
import { useMySubmissions } from "./use-my-submissions";

const STATUS_META: Record<Submission["status"], { label: string; tone: StatusTone }> = {
  pending: { label: "Pending review", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

function mediaSummary(submission: Submission): string {
  const media = submission.media ?? [];
  const images = media.filter((asset) => asset.kind === "image").length;
  const documents = media.filter((asset) => asset.kind === "document").length;
  const panorama = media.some((asset) => asset.kind === "panorama");
  return [
    `${images} ${images === 1 ? "image" : "images"}`,
    panorama ? "360° panorama" : null,
    documents ? `${documents} private ${documents === 1 ? "document" : "documents"}` : null,
  ].filter(Boolean).join(" · ");
}

export function MySubmissionsView() {
  const { items, loading, error, reload } = useMySubmissions();
  const submissionsPage = useFilteredPage(items, items.length);
  const [active, setActive] = React.useState<Submission | null>(null);
  const [withdrawing, setWithdrawing] = React.useState<Submission | null>(null);
  const [busy, setBusy] = React.useState(false);
  const pendingCount = items.filter((item) => item.status === "pending").length;
  const approvedCount = items.filter((item) => item.status === "approved").length;
  const rejectedCount = items.filter((item) => item.status === "rejected").length;

  const columns = React.useMemo<readonly DataColumn<Submission>[]>(
    () => [
      {
        key: "listing",
        header: "Listing",
        render: (submission) => (
          <DataTablePrimaryCell title={submission.title} subtitle={submission.location} />
        ),
      },
      {
        key: "price",
        header: "Price",
        align: "right",
        render: (submission) => (
          <span className="font-medium tabular-nums">{formatPaiseCompact(submission.price_paise)}</span>
        ),
      },
      { key: "media", header: "Media", render: mediaSummary },
      {
        key: "submitted",
        header: "Submitted",
        render: (submission) => new Date(submission.created_at).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
      },
      {
        key: "state",
        header: "State",
        render: (submission) => {
          const meta = STATUS_META[submission.status];
          return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
        },
      },
    ],
    [],
  );

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

  function requestWithdraw(submission: Submission) {
    setActive(null);
    setWithdrawing(submission);
  }

  return (
    <DashboardPage>
      <DashboardHeader
        title="My listings"
        description="Track every property submitted for review and see the latest approval state."
        actions={<Button asChild size="sm"><Link href="/dashboard/property-submit">New listing</Link></Button>}
      />

      {error ? (
        <FetchError status={null} message={error} onRetry={() => void reload()} />
      ) : (
        <>
          <MetricGrid>
            <MetricCard label="All listings" value={items.length} icon={DASHBOARD_ICONS.propertyListings} />
            <MetricCard label="Pending review" value={pendingCount} icon={DASHBOARD_ICONS.listingApprovals} attention={pendingCount > 0} />
            <MetricCard label="Approved" value={approvedCount} icon={DASHBOARD_ICONS.listingApprovals} />
            <MetricCard label="Rejected" value={rejectedCount} icon={DASHBOARD_ICONS.propertyListings} attention={rejectedCount > 0} />
          </MetricGrid>

          <DashboardPanel
            title="Submission history"
            description="Media counts, review state, and reviewer feedback for your listings."
            bodyClassName="p-0"
          >
            {loading ? (
              <div className="p-5"><ListLoadingState rows={5} /></div>
            ) : items.length === 0 ? (
              <ListEmptyState
                icon={Inbox}
                title="No submissions yet"
                description="Submit your first property listing for Admin review."
                action={<Button asChild size="sm"><Link href="/dashboard/property-submit">Submit your first listing</Link></Button>}
                className="m-5"
              />
            ) : (
              <>
                <DataTable
                  columns={columns}
                  rows={submissionsPage.pageRows}
                  rowKey={(submission) => submission.id}
                  onRowClick={setActive}
                  rowActionLabel="Open listing details"
                  minWidth="min-w-[860px]"
                />
                <div className="px-5 pb-5">
                  <ListPagination page={submissionsPage.page} total={submissionsPage.total} onPageChange={submissionsPage.setPage} />
                </div>
              </>
            )}
          </DashboardPanel>
        </>
      )}

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent>
          {active ? (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
                  <div>
                    <DialogTitle>{active.title}</DialogTitle>
                    <DialogDescription>{active.location}</DialogDescription>
                  </div>
                  <StatusBadge tone={STATUS_META[active.status].tone}>
                    {STATUS_META[active.status].label}
                  </StatusBadge>
                </div>
              </DialogHeader>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div><dt className="text-text-secondary">Price</dt><dd className="font-medium">{formatPaiseCompact(active.price_paise)}</dd></div>
                <div><dt className="text-text-secondary">Media</dt><dd className="font-medium">{mediaSummary(active)}</dd></div>
                <div><dt className="text-text-secondary">Property type</dt><dd className="font-medium capitalize">{active.property_subtype?.replaceAll("_", " ") ?? active.type}</dd></div>
                <div><dt className="text-text-secondary">Submitted</dt><dd className="font-medium">{new Date(active.created_at).toLocaleString("en-IN")}</dd></div>
              </dl>
              {active.status === "rejected" && active.review_note ? (
                <p className="rounded-lg bg-destructive/5 p-3 text-sm text-text-secondary">
                  Reviewer note: {active.review_note}
                </p>
              ) : null}
              {active.status === "withdrawn" ? null : (
                <DialogFooter>
                  <Button variant="ghost" onClick={() => requestWithdraw(active)}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Withdraw
                  </Button>
                  <Button asChild>
                    <Link href={`/dashboard/my-submissions/${active.id}/edit`}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      Edit listing
                    </Link>
                  </Button>
                </DialogFooter>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

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
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
              Withdraw listing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardPage>
  );
}
