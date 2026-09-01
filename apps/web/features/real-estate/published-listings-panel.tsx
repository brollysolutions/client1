"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Home, Loader2, PencilLine, Trash2 } from "lucide-react";
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
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DashboardPanel } from "@/features/dashboard/dashboard-ui";
import {
  DataTable,
  DataTablePrimaryCell,
  nextSort,
  type DataColumn,
  type SortState,
} from "@/features/dashboard/data-table";
import { FetchError } from "@/features/dashboard/fetch-error";
import {
  EMPTY_FILTERS,
  FilterBar,
  filtersAreActive,
  matchesSearch,
  type FilterBarValue,
} from "@/features/dashboard/filter-bar";
import { ListEmptyState, ListLoadingState, ListPagination } from "@/features/dashboard/list-states";
import { StatusBadge, type StatusTone } from "@/features/dashboard/status-badge";
import { useFilteredPage } from "@/features/dashboard/use-filtered-page";
import { isInDateRange } from "@/lib/date-range";
import { formatDate, formatPaiseCompact } from "@/lib/format";
import { requiredTextError } from "@/lib/form-validation";
import { setPropertyActive } from "@/lib/properties-api";
import { withdrawSubmission } from "@/lib/property-submissions-api";

import { usePublishedListings, type PublishedListing } from "./use-published-listings";

const RERA_LABEL: Record<string, string> = {
  not_reviewed: "Not reviewed",
  verified: "Verified",
  mismatch: "Mismatch",
  exemption_verified: "Exemption verified",
};

const RERA_TONE: Record<string, StatusTone> = {
  not_reviewed: "warning",
  verified: "success",
  mismatch: "danger",
  exemption_verified: "success",
};

const STATUS_OPTIONS = [
  { value: "live", label: "Live" },
  { value: "hidden", label: "Hidden" },
];

type PendingPublish = { row: PublishedListing; next: boolean };

/**
 * The published half of the listing lifecycle.
 *
 * Replaces a hand-rolled table whose only control was a publish toggle that
 * collected its audit reason through `window.prompt()`. Publish, edit, and
 * delete all live here now, on the same table primitives as every other admin
 * queue.
 */
export function PublishedListingsPanel({ onChanged }: { onChanged?: () => void }) {
  const router = useRouter();
  const { items, loading, error, reload } = usePublishedListings();
  const [filters, setFilters] = React.useState<FilterBarValue>(EMPTY_FILTERS);
  const [sort, setSort] = React.useState<SortState>({ key: "created_at", dir: "desc" });
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const [pendingPublish, setPendingPublish] = React.useState<PendingPublish | null>(null);
  const [reason, setReason] = React.useState("");
  const [reasonError, setReasonError] = React.useState<string>();
  const [pendingEdit, setPendingEdit] = React.useState<PublishedListing | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<PublishedListing | null>(null);

  const filtered = React.useMemo(() => {
    const rows = items.filter(({ submission, property }) => {
      if (filters.status === "live" && !property?.active) return false;
      if (filters.status === "hidden" && property?.active) return false;
      if (!isInDateRange(submission.created_at, filters.from, filters.to)) return false;
      return matchesSearch(
        `${submission.title} ${submission.location} ${submission.rera_number ?? ""}`,
        filters.search,
      );
    });
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => {
      const result =
        sort.key === "title"
          ? left.submission.title.localeCompare(right.submission.title)
          : sort.key === "price_paise"
            ? left.submission.price_paise - right.submission.price_paise
            : left.submission.created_at.localeCompare(right.submission.created_at);
      return result * direction || left.submission.title.localeCompare(right.submission.title);
    });
  }, [filters, items, sort]);

  const { page, setPage, pageRows, total } = useFilteredPage(filtered, [filters, sort]);

  function beginPublish(row: PublishedListing, next: boolean) {
    setReason("");
    setReasonError(undefined);
    setPendingPublish({ row, next });
  }

  async function confirmPublish() {
    if (!pendingPublish?.row.property) return;
    const validationError = requiredTextError(reason, "Reason", 1000);
    setReasonError(validationError);
    if (validationError) return;
    const { row, next } = pendingPublish;
    setBusyId(row.submission.id);
    const result = await setPropertyActive(row.property!.id, {
      active: next,
      reason: reason.trim(),
    });
    setBusyId(null);
    if (!result.ok) {
      toast.error("Could not update listing", { description: result.error });
      return;
    }
    setPendingPublish(null);
    toast.success(next ? "Listing published" : "Listing unpublished");
    void reload();
    onChanged?.();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusyId(pendingDelete.submission.id);
    const result = await withdrawSubmission(pendingDelete.submission.id);
    setBusyId(null);
    if (!result.ok) {
      toast.error("Could not delete listing", { description: result.error });
      return;
    }
    setPendingDelete(null);
    toast.success("Listing deleted", {
      description: "It has been withdrawn and taken off the public catalogue.",
    });
    void reload();
    onChanged?.();
  }

  const columns: readonly DataColumn<PublishedListing>[] = [
    {
      key: "title",
      header: "Listing",
      sortable: true,
      cellClassName: "max-w-[22rem]",
      render: ({ submission }) => (
        <DataTablePrimaryCell title={submission.title} subtitle={submission.location} />
      ),
    },
    {
      key: "price_paise",
      header: "Price",
      sortable: true,
      align: "right",
      render: ({ submission }) => (
        <span className="tabular-nums">{formatPaiseCompact(submission.price_paise)}</span>
      ),
    },
    {
      key: "rera",
      header: "RERA",
      render: ({ submission }) => (
        <StatusBadge tone={RERA_TONE[submission.rera_verification_status] ?? "neutral"}>
          {RERA_LABEL[submission.rera_verification_status] ?? submission.rera_verification_status}
        </StatusBadge>
      ),
    },
    {
      key: "availability",
      header: "Availability",
      render: ({ property }) =>
        property ? (
          <StatusBadge tone={property.active ? "success" : "neutral"}>
            {property.active ? "Live" : "Hidden"}
          </StatusBadge>
        ) : (
          <StatusBadge tone="danger">Catalogue row missing</StatusBadge>
        ),
    },
    {
      key: "created_at",
      header: "Submitted",
      sortable: true,
      align: "right",
      render: ({ submission }) => (
        <span className="tabular-nums text-text-secondary">
          {formatDate(submission.created_at)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (row) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!row.property || busyId === row.submission.id}
            onClick={() => beginPublish(row, !row.property?.active)}
          >
            {busyId === row.submission.id ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : row.property?.active ? (
              "Unpublish"
            ) : (
              "Publish"
            )}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPendingEdit(row)}>
            <PencilLine className="h-4 w-4" aria-hidden="true" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busyId === row.submission.id}
            onClick={() => setPendingDelete(row)}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Delete listing</span>
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <FilterBar
        value={filters}
        onChange={setFilters}
        searchLabel="Search published listings"
        searchPlaceholder="Listing, location, or RERA number"
        statusOptions={STATUS_OPTIONS}
        statusLabel="availability"
        showLine={false}
        dateFromLabel="Submitted from"
        dateToLabel="Submitted to"
        note="Editing a published listing returns it to review; deleting takes it off the public catalogue."
      />

      {loading ? (
        <ListLoadingState />
      ) : error ? (
        <FetchError status={null} message={error} onRetry={() => void reload()} />
      ) : total === 0 ? (
        <ListEmptyState
          icon={Home}
          title={
            filtersAreActive(filters)
              ? "No listings match these filters"
              : "No published listings yet"
          }
          description={
            filtersAreActive(filters)
              ? "Try a different search, availability, or submitted-date range."
              : "Listings you approve will appear here."
          }
        />
      ) : (
        <DashboardPanel
          title="Published listings"
          description={
            filtersAreActive(filters)
              ? `${total} of ${items.length} listings`
              : `${items.length} listings`
          }
          bodyClassName="p-0"
        >
          <DataTable
            columns={columns}
            rows={pageRows}
            rowKey={({ submission }) => submission.id}
            sort={sort}
            onSortChange={(key) => setSort((current) => nextSort(current, key))}
            minWidth="min-w-[960px]"
          />
          <div className="px-5 pb-4">
            <ListPagination page={page} total={total} onPageChange={setPage} />
          </div>
        </DashboardPanel>
      )}

      <Dialog
        open={pendingPublish !== null}
        onOpenChange={(open) => !open && setPendingPublish(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {pendingPublish?.next ? "Publish listing" : "Unpublish listing"}
            </DialogTitle>
            <DialogDescription>
              {pendingPublish?.row.submission.title}.{" "}
              {pendingPublish?.next
                ? "It becomes visible on the public catalogue again."
                : "It disappears from the public catalogue. Its reviewed facts and media are untouched."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="publish-reason">
              Reason
              <RequiredIndicator />
            </Label>
            <Textarea
              id="publish-reason"
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setReasonError(undefined);
              }}
              aria-invalid={Boolean(reasonError)}
              aria-describedby={reasonError ? "publish-reason-error" : undefined}
              placeholder="Recorded in the audit log."
            />
            <FieldError id="publish-reason-error">{reasonError}</FieldError>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingPublish(null)}
              disabled={busyId !== null}
            >
              Cancel
            </Button>
            <Button onClick={() => void confirmPublish()} disabled={busyId !== null}>
              {busyId !== null ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {pendingPublish?.next ? "Publish" : "Unpublish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingEdit !== null} onOpenChange={(open) => !open && setPendingEdit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit {pendingEdit?.submission.title}?</DialogTitle>
            <DialogDescription>
              Editing returns this listing to review and clears its RERA verification, so you will
              have to verify and approve it again. The live listing keeps its currently published
              facts until you do.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingEdit(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!pendingEdit) return;
                router.push(`/dashboard/property-review/${pendingEdit.submission.id}/correct`);
              }}
            >
              Open correction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete {pendingDelete?.submission.title}?</DialogTitle>
            <DialogDescription>
              The listing is withdrawn and taken off the public catalogue immediately. Its record
              and audit history are retained, but it can no longer be published or edited.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingDelete(null)}
              disabled={busyId !== null}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={busyId !== null}
            >
              {busyId !== null ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Delete listing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
