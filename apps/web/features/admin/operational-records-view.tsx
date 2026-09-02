"use client";

import * as React from "react";
import { Database, Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listAdminAuthEvents,
  listAdminEnquiries,
  listAdminFinancialServiceEnquiries,
  listAdminFieldVisibilityConfigs,
  listAdminLeadActivities,
  listAdminLoanTransactionHistory,
  listAdminSiteVisits,
  listAdminTransactions,
  type AdminAuthEvent,
  type AdminEnquiry,
  type AdminFinancialServiceEnquiry,
  type AdminFieldVisibilityConfig,
  type AdminLeadActivity,
  type AdminLoanTransactionHistory,
  type AdminSiteVisit,
  type AdminTransaction,
} from "@/lib/admin-operations-api";
import type { ApiResponse } from "@/lib/api/client";

import { filterOperationalRecords, type OperationalRecord } from "./operational-records-filter";

const PAGE_SIZE = 25;

const OPERATION_TABS = [
  { key: "auth-events", label: "Security events" },
  { key: "enquiries", label: "Enquiries" },
  { key: "financial-enquiries", label: "Card & insurance" },
  { key: "field-visibility", label: "Field visibility" },
  { key: "lead-activities", label: "Lead activity" },
  { key: "loan-history", label: "Loan terms" },
  { key: "site-visits", label: "Site visits" },
  { key: "transactions", label: "Transactions" },
] as const;

type OperationKind = (typeof OPERATION_TABS)[number]["key"];
type OperationalPage = { records: OperationalRecord[]; total: number };
type ViewState = OperationalPage & {
  loaded: boolean;
  loading: boolean;
  offset: number;
  error: string | null;
};

function initialState(): Record<OperationKind, ViewState> {
  const empty = (): ViewState => ({
    records: [],
    total: 0,
    loaded: false,
    loading: false,
    offset: 0,
    error: null,
  });
  return {
    "auth-events": empty(),
    enquiries: empty(),
    "financial-enquiries": empty(),
    "field-visibility": empty(),
    "lead-activities": empty(),
    "loan-history": empty(),
    "site-visits": empty(),
    transactions: empty(),
  };
}

function humanize(value: string | null | undefined): string {
  if (!value) return "Not set";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatWhen(value: string | null | undefined): string {
  if (!value) return "Not set";
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Not set";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatId(value: string | null | undefined): string {
  return value ?? "Deleted or unlinked account";
}

function formatRupees(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "Not set";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatPaise(value: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function authEventRecord(row: AdminAuthEvent): OperationalRecord {
  return {
    id: row.id,
    title: humanize(row.event_type),
    subtitle: row.success ? "Successful authentication event" : "Failed authentication event",
    status: row.success ? "Success" : "Failed",
    fields: [
      { label: "Account", value: formatId(row.auth_user_uuid) },
      { label: "Recorded", value: formatWhen(row.created_at) },
    ],
  };
}

function enquiryRecord(row: AdminEnquiry): OperationalRecord {
  return {
    id: row.id,
    title: row.title,
    subtitle: `${row.locality}, ${row.city}`,
    status: humanize(row.status),
    fields: [
      { label: "Property reference", value: row.property_ref },
      { label: "Client account", value: row.user_uuid },
      { label: "Created", value: formatWhen(row.created_at) },
      { label: "Last updated", value: formatWhen(row.updated_at) },
    ],
  };
}

export function financialServiceEnquiryRecord(
  row: AdminFinancialServiceEnquiry,
): OperationalRecord {
  return {
    id: row.id,
    title: row.product_label,
    subtitle: `${humanize(row.product_category)} enquiry`,
    status: humanize(row.status),
    fields: [
      { label: "Form version", value: String(row.form_version) },
      { label: "Submitted", value: formatWhen(row.submitted_at) },
    ],
  };
}

export function fieldVisibilityConfigRecord(
  row: AdminFieldVisibilityConfig,
): OperationalRecord {
  return {
    id: row.id,
    title: `${humanize(row.entity)} ${humanize(row.field_key)}`,
    subtitle: `${humanize(row.target_role)} / ${humanize(row.entity)} policy`,
    status: humanize(row.mode),
    fields: [
      { label: "Field key", value: row.field_key },
      { label: "Last updated", value: formatWhen(row.updated_at) },
    ],
  };
}

function leadActivityRecord(row: AdminLeadActivity): OperationalRecord {
  return {
    id: row.id,
    title: humanize(row.disposition),
    subtitle: `${humanize(row.business_line)} lead activity`,
    status: humanize(row.interest_level),
    fields: [
      { label: "Lead", value: row.lead_uuid },
      { label: "Telecaller profile", value: row.telecaller_staff_profile_uuid },
      { label: "Follow-up", value: formatWhen(row.follow_up_at) },
      { label: "Logged", value: formatWhen(row.created_at) },
    ],
  };
}

function loanHistoryRecord(row: AdminLoanTransactionHistory): OperationalRecord {
  return {
    id: row.id,
    title: row.bank_name ?? "Loan terms entry",
    subtitle: `${humanize(row.business_line)} application history`,
    fields: [
      { label: "Application", value: row.loan_application_uuid },
      { label: "Amount", value: formatRupees(row.amount) },
      {
        label: "Interest rate",
        value: row.interest_rate === null ? "Not set" : `${row.interest_rate}%`,
      },
      { label: "Transaction date", value: formatDate(row.txn_date) },
      { label: "Entered by", value: formatId(row.entered_by_staff_profile_uuid) },
      { label: "Logged", value: formatWhen(row.created_at) },
    ],
  };
}

function siteVisitRecord(row: AdminSiteVisit): OperationalRecord {
  return {
    id: row.id,
    title: row.title,
    subtitle: `${row.locality}, ${row.city}`,
    status: humanize(row.status),
    fields: [
      { label: "Property reference", value: row.property_ref },
      { label: "Client account", value: row.user_uuid },
      {
        label: "Preferred slot",
        value: `${formatDate(row.preferred_date)} · ${humanize(row.preferred_time_slot)}`,
      },
      { label: "Requested", value: formatWhen(row.created_at) },
      { label: "Cancelled", value: formatWhen(row.cancelled_at) },
    ],
  };
}

function transactionRecord(row: AdminTransaction): OperationalRecord {
  return {
    id: row.id,
    title: row.description,
    subtitle: `${humanize(row.type)} · ${humanize(row.business_line)}`,
    status: humanize(row.status),
    fields: [
      { label: "Amount", value: formatPaise(row.amount_paise, row.currency) },
      { label: "Account", value: formatId(row.user_uuid) },
      { label: "Recorded", value: formatWhen(row.created_at) },
    ],
  };
}

function normalize<T>(
  response: ApiResponse<T>,
  project: (data: T) => OperationalPage,
): ApiResponse<OperationalPage> {
  if (!response.ok) return response;
  return { ...response, data: project(response.data) };
}

async function fetchOperationalPage(
  kind: OperationKind,
  offset: number,
): Promise<ApiResponse<OperationalPage>> {
  const page = { limit: PAGE_SIZE, offset };
  switch (kind) {
    case "auth-events":
      return normalize(await listAdminAuthEvents(page), (data) => ({
        records: data.events.map(authEventRecord),
        total: data.total,
      }));
    case "enquiries":
      return normalize(await listAdminEnquiries(page), (data) => ({
        records: data.enquiries.map(enquiryRecord),
        total: data.total,
      }));
    case "financial-enquiries":
      return normalize(await listAdminFinancialServiceEnquiries(page), (data) => ({
        records: data.enquiries.map(financialServiceEnquiryRecord),
        total: data.total,
      }));
    case "field-visibility":
      return normalize(await listAdminFieldVisibilityConfigs(page), (data) => ({
        records: data.configs.map(fieldVisibilityConfigRecord),
        total: data.total,
      }));
    case "lead-activities":
      return normalize(await listAdminLeadActivities(page), (data) => ({
        records: data.activities.map(leadActivityRecord),
        total: data.total,
      }));
    case "loan-history":
      return normalize(await listAdminLoanTransactionHistory(page), (data) => ({
        records: data.entries.map(loanHistoryRecord),
        total: data.total,
      }));
    case "site-visits":
      return normalize(await listAdminSiteVisits(page), (data) => ({
        records: data.visits.map(siteVisitRecord),
        total: data.total,
      }));
    case "transactions":
      return normalize(await listAdminTransactions(page), (data) => ({
        records: data.transactions.map(transactionRecord),
        total: data.total,
      }));
  }
}

function RecordCards({ records }: { records: OperationalRecord[] }) {
  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {records.map((record) => (
        <li key={record.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-medium text-text-primary">{record.title}</h2>
              <p className="mt-1 text-sm text-text-secondary">{record.subtitle}</p>
            </div>
            {record.status ? <Badge variant="outline">{record.status}</Badge> : null}
          </div>
          <dl className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
            {record.fields.map((field) => (
              <div key={field.label} className="min-w-0">
                <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                  {field.label}
                </dt>
                <dd className="mt-1 break-all text-sm text-text-primary">{field.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 break-all border-t border-border pt-3 text-xs text-text-secondary">
            Record ID: {record.id}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function OperationalRecordsView() {
  const [active, setActive] = React.useState<OperationKind>("auth-events");
  const [states, setStates] = React.useState(initialState);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");

  const load = React.useCallback(async (kind: OperationKind, offset: number) => {
    setStates((current) => ({
      ...current,
      [kind]: {
        ...current[kind],
        loading: true,
        error: null,
      },
    }));
    const response = await fetchOperationalPage(kind, offset);
    setStates((current) => {
      const previous = current[kind];
      if (!response.ok) {
        return {
          ...current,
          [kind]: {
            ...previous,
            loaded: true,
            loading: false,
            error: response.error,
          },
        };
      }
      return {
        ...current,
        [kind]: {
          records: response.data.records,
          total: response.data.total,
          offset,
          loaded: true,
          loading: false,
          error: null,
        },
      };
    });
  }, []);

  const state = states[active];
  const statusOptions = React.useMemo(
    () => [...new Set(state.records.flatMap((record) => (record.status ? [record.status] : [])))],
    [state.records],
  );
  const visibleRecords = React.useMemo(
    () => filterOperationalRecords(state.records, search, statusFilter),
    [search, state.records, statusFilter],
  );
  let emptyCopy = {
    title: "No records in this category yet.",
    description: "New operational activity will appear here in newest-first order.",
  };
  if (active === "field-visibility") {
    emptyCopy = {
      title: "No persisted field visibility overrides.",
      description: "Role responses currently use the server-owned visibility defaults.",
    };
  } else if (active === "financial-enquiries") {
    emptyCopy = {
      title: "No card or insurance enquiries yet.",
      description: "Submitted requests will appear here without applicant or form details.",
    };
  }
  React.useEffect(() => {
    if (!state.loaded && !state.loading) void load(active, 0);
  }, [active, load, state.loaded, state.loading]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Operational records</h1>
        <p className="mt-1 max-w-3xl text-sm text-text-secondary">
          Read-only, platform-wide workflow and security context. Contact details, messages,
          authentication metadata, pickup locations, updater identities, and reusable financial
          references are omitted. Card and insurance records also omit applicant identifiers and
          form answers.
        </p>
      </div>

      <Tabs
        value={active}
        onValueChange={(value) => {
          setActive(value as OperationKind);
          setSearch("");
          setStatusFilter("all");
        }}
      >
        <div className="overflow-x-auto pb-1">
          <TabsList aria-label="Operational record category" className="min-w-max">
            {OPERATION_TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value={active} className="mt-4">
          {state.loading ? (
            <div
              className="flex min-h-52 items-center justify-center gap-2 rounded-2xl border border-border bg-card text-sm text-text-secondary"
              role="status"
            >
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              Loading records…
            </div>
          ) : state.error && state.records.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center" role="alert">
              <p className="text-sm text-text-secondary">{state.error}</p>
              <Button variant="outline" className="mt-4" onClick={() => void load(active, 0)}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Try again
              </Button>
            </div>
          ) : state.records.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
              <Database className="h-8 w-8 text-text-secondary" aria-hidden="true" />
              <p className="mt-3 font-medium text-text-primary">{emptyCopy.title}</p>
              <p className="mt-1 text-sm text-text-secondary">{emptyCopy.description}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-text-secondary" aria-live="polite">
                  Showing {state.total === 0 ? 0 : state.offset + 1}-{state.offset + state.records.length} of {state.total}
                </p>
                <Button variant="outline" size="sm" onClick={() => void load(active, 0)}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Refresh
                </Button>
              </div>
              {state.error ? (
                <p
                  className="rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error"
                  role="alert"
                >
                  {state.error}
                </p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <Input
                  type="search"
                  aria-label="Search operational records on this page"
                  placeholder="Search this page"
                  value={search}
                  maxLength={100}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger aria-label="Filter operational records by status" className="w-full">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {statusOptions.map((status) => (
                      <SelectItem key={status} value={status}>{status}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {visibleRecords.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-secondary">
                  No records on this page match these filters.
                </p>
              ) : (
                <RecordCards records={visibleRecords} />
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" disabled={state.offset === 0} onClick={() => void load(active, Math.max(0, state.offset - PAGE_SIZE))}>Previous</Button>
                <Button variant="outline" size="sm" disabled={state.offset + state.records.length >= state.total} onClick={() => void load(active, state.offset + PAGE_SIZE)}>Next</Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
