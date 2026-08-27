"use client";

import * as React from "react";
import { Headset, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DashboardHeader, DashboardPage, DashboardPanel } from "@/features/dashboard/dashboard-ui";
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
import { advanceSupportTicket, type SupportTicketAdmin } from "@/lib/admin-api";
import { isInDateRange } from "@/lib/date-range";
import { formatDate } from "@/lib/format";
import { optionalTextError } from "@/lib/form-validation";
import { formatMobile } from "@/lib/phone";
import { CATEGORIES, CATEGORY_LABEL, STATUS_STYLES, type SupportStatus } from "@/lib/support-tickets";

import { useSupportTicketsAdmin } from "./use-support-tickets-admin";
import { MobileChangeQueue } from "./mobile-change-queue";

// Mirrors services/support_tickets.py::_TRANSITIONS exactly. Kept in sync by
// hand (small, stable enum) rather than derived from the wire response --
// there is no "legal next statuses" field on SupportTicketAdminRead.
const TRANSITIONS: Record<SupportStatus, Exclude<SupportStatus, "open">[]> = {
  open: ["in_progress", "closed"],
  in_progress: ["resolved", "closed"],
  resolved: ["closed"],
  closed: [],
};

// "open" is never a legal transition TARGET (no reopen path in TRANSITIONS
// above), so it's deliberately excluded here rather than carrying a dead
// "Reopen" label that could never render.
const ACTION_LABEL: Record<Exclude<SupportStatus, "open">, string> = {
  in_progress: "Mark in progress",
  resolved: "Mark resolved",
  closed: "Close",
};

const STATUS_TONE: Record<SupportStatus, StatusTone> = {
  open: "warning",
  in_progress: "info",
  resolved: "success",
  closed: "neutral",
};

const STATUS_OPTIONS = (Object.keys(STATUS_STYLES) as SupportStatus[]).map((value) => ({
  value,
  label: STATUS_STYLES[value].label,
}));

const CATEGORY_OPTIONS = CATEGORIES.map((value) => ({ value, label: CATEGORY_LABEL[value] }));

// Triage starts on the open queue rather than everything ever raised.
const DEFAULT_FILTERS: FilterBarValue = { ...EMPTY_FILTERS, status: "open" };

export function SupportTicketsView() {
  const [filters, setFilters] = React.useState<FilterBarValue>(DEFAULT_FILTERS);
  const [sort, setSort] = React.useState<SortState>({ key: "created_at", dir: "desc" });
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [noteError, setNoteError] = React.useState<string>();
  const [busyStatus, setBusyStatus] = React.useState<SupportStatus | null>(null);

  const { items, loading, error, reload } = useSupportTicketsAdmin(
    filters.status === "all" ? undefined : filters.status,
  );

  const filtered = React.useMemo(() => {
    const rows = items.filter(
      (ticket) =>
        isInDateRange(ticket.created_at, filters.from, filters.to) &&
        (filters.kind === "all" || ticket.category === filters.kind) &&
        matchesSearch(
          `${ticket.subject} ${ticket.body} ${ticket.requester_name ?? ""} ${ticket.requester_mobile ?? ""}`,
          filters.search,
        ),
    );
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sort.key) {
        case "subject":
          return a.subject.localeCompare(b.subject) * direction;
        case "category":
          return a.category.localeCompare(b.category) * direction;
        case "status":
          return a.status.localeCompare(b.status) * direction;
        default:
          return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * direction;
      }
    });
  }, [filters, items, sort]);

  const { page, setPage, pageRows, total } = useFilteredPage(filtered, filters);
  const active = activeId ? items.find((ticket) => ticket.id === activeId) ?? null : null;

  function openTicket(ticket: SupportTicketAdmin) {
    setActiveId(ticket.id);
    setNote("");
    setNoteError(undefined);
  }

  async function onAdvance(ticket: SupportTicketAdmin, target: SupportStatus) {
    const validationError = optionalTextError(note, "Resolution note", 2000);
    setNoteError(validationError);
    if (validationError) return;
    setBusyStatus(target);
    const res = await advanceSupportTicket(ticket.id, {
      status: target,
      resolution_note: note.trim() || null,
    });
    setBusyStatus(null);
    if (res.ok) {
      toast.success(`Ticket marked ${STATUS_STYLES[target].label.toLowerCase()}`);
      setActiveId(null);
      setNote("");
      setNoteError(undefined);
      void reload();
    } else {
      toast.error("Could not update ticket", { description: res.error });
    }
  }

  const columns: DataColumn<SupportTicketAdmin>[] = [
    {
      key: "subject",
      header: "Subject",
      sortable: true,
      cellClassName: "max-w-[24rem]",
      render: (ticket) => (
        <DataTablePrimaryCell
          title={ticket.subject}
          subtitle={ticket.requester_name ?? "Deleted account"}
        />
      ),
    },
    {
      key: "category",
      header: "Category",
      sortable: true,
      render: (ticket) => (
        <span className="text-text-secondary">{CATEGORY_LABEL[ticket.category]}</span>
      ),
    },
    {
      key: "requester_mobile",
      header: "Mobile",
      render: (ticket) => (
        <span className="tabular-nums text-text-secondary">
          {ticket.requester_mobile ? formatMobile(ticket.requester_mobile) : "-"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (ticket) => (
        <StatusBadge tone={STATUS_TONE[ticket.status] ?? "neutral"}>
          {STATUS_STYLES[ticket.status].label}
        </StatusBadge>
      ),
    },
    {
      key: "created_at",
      header: "Raised",
      sortable: true,
      align: "right",
      render: (ticket) => (
        <span className="tabular-nums text-text-secondary">{formatDate(ticket.created_at)}</span>
      ),
    },
  ];

  return (
    <DashboardPage>
      <DashboardHeader
        title="Support tickets"
        description="Login, OTP, and lost-mobile requests are handled here exclusively."
      />

      {/* Carries its own tinted panel and heading — it is a distinct queue with
          its own statuses, not a section of the ticket list. */}
      <MobileChangeQueue />

      <FilterBar
        value={filters}
        onChange={setFilters}
        searchLabel="Search support tickets"
        searchPlaceholder="Subject, body, or requester"
        statusOptions={STATUS_OPTIONS}
        kindOptions={CATEGORY_OPTIONS}
        kindLabel="Categories"
        showLine={false}
        dateFromLabel="Raised from"
        dateToLabel="Raised to"
      />

      {loading ? (
        <ListLoadingState />
      ) : error ? (
        <FetchError status={null} message={error} onRetry={() => void reload()} />
      ) : total === 0 ? (
        <ListEmptyState
          icon={Headset}
          title={filters.status === "open" ? "No open tickets" : "No tickets match these filters"}
          description={
            filters.status === "open"
              ? "Requests raised from the client support form arrive here."
              : "Try a different search, status, category, or date range."
          }
        />
      ) : (
        <DashboardPanel
          title="Tickets"
          description={
            filtersAreActive(filters) ? `${total} of ${items.length} tickets` : `${items.length} tickets`
          }
          bodyClassName="p-0"
        >
          <DataTable
            columns={columns}
            rows={pageRows}
            rowKey={(ticket) => ticket.id}
            sort={sort}
            onSortChange={(key) => setSort((current) => nextSort(current, key))}
            onRowClick={openTicket}
            rowActionLabel="Open ticket"
            minWidth="min-w-[860px]"
          />
          <div className="px-5 pb-4">
            <ListPagination page={page} total={total} onPageChange={setPage} />
          </div>
        </DashboardPanel>
      )}

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActiveId(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          {active ? (
            <>
              <DialogHeader>
                <DialogTitle>{active.subject}</DialogTitle>
                <DialogDescription>
                  {CATEGORY_LABEL[active.category]} · {active.requester_name ?? "Deleted account"}
                  {active.requester_mobile ? ` · ${formatMobile(active.requester_mobile)}` : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <StatusBadge tone={STATUS_TONE[active.status] ?? "neutral"}>
                    {STATUS_STYLES[active.status].label}
                  </StatusBadge>
                  <span className="text-xs text-text-secondary">
                    Raised {formatDate(active.created_at)}
                  </span>
                </div>

                <p className="whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-sm text-text-primary">
                  {active.body}
                </p>

                {active.resolution_note ? (
                  <div>
                    <p className="text-xs font-medium text-text-secondary">Current internal note</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary">
                      {active.resolution_note}
                    </p>
                  </div>
                ) : null}

                {TRANSITIONS[active.status].length > 0 ? (
                  <div>
                    <Textarea
                      value={note}
                      onChange={(event) => {
                        setNote(event.target.value);
                        setNoteError(undefined);
                      }}
                      placeholder="What did you tell the requester? (optional, staff-only)"
                      rows={3}
                      maxLength={2000}
                      aria-invalid={Boolean(noteError)}
                      aria-describedby={noteError ? "support-resolution-note-error" : undefined}
                    />
                    <FieldError id="support-resolution-note-error">{noteError}</FieldError>
                  </div>
                ) : null}
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                {TRANSITIONS[active.status].length === 0 ? (
                  <p className="text-sm text-text-secondary">This ticket is closed.</p>
                ) : (
                  TRANSITIONS[active.status].map((target) => (
                    <Button
                      key={target}
                      variant={target === "closed" ? "outline" : "default"}
                      onClick={() => void onAdvance(active, target)}
                      disabled={busyStatus !== null}
                    >
                      {busyStatus === target ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {ACTION_LABEL[target]}
                    </Button>
                  ))
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </DashboardPage>
  );
}
