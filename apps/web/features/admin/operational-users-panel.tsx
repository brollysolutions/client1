"use client";

import * as React from "react";
import { Loader2, ShieldAlert, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DataTable,
  DataTablePrimaryCell,
  type DataColumn,
} from "@/features/dashboard/data-table";
import { FetchError } from "@/features/dashboard/fetch-error";
import { EMPTY_FILTERS, FilterBar, filtersAreActive, type FilterBarValue } from "@/features/dashboard/filter-bar";
import { ListEmptyState, ListLoadingState, ListPagination } from "@/features/dashboard/list-states";
import { StatusBadge, type StatusTone } from "@/features/dashboard/status-badge";
import { LIST_PAGE_SIZE } from "@/features/dashboard/use-filtered-page";
import { formatDate } from "@/lib/format";
import { requiredTextError } from "@/lib/form-validation";
import { formatMobile } from "@/lib/phone";
import {
  getOperationalUsers,
  setOperationalUserStatus,
  type AdminUser,
  type AdminUserQuery,
} from "@/lib/admin-users-api";

const STATUS_TONE: Record<string, StatusTone> = {
  active: "success",
  suspended: "danger",
  pending_password_reset: "warning",
  soft_deleted: "neutral",
};

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "pending_password_reset", label: "Pending password reset" },
  { value: "soft_deleted", label: "Deleted" },
];

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "sub_admin", label: "Sub Admin" },
  { value: "telecaller", label: "Telecaller" },
  { value: "employee", label: "Employee" },
  { value: "agent", label: "Agent" },
  { value: "client", label: "Client" },
];

const LOGIN_OPTIONS = [
  { value: "never", label: "Never signed in" },
  { value: "has", label: "Has signed in" },
];

const ACTIONABLE_STATUSES: readonly string[] = ["active", "suspended"];

function profileLine(line: "loans" | "real_estate"): string {
  return line === "real_estate" ? "Real Estate" : "Loans";
}

function displayRoles(user: AdminUser): string {
  return user.roles.length === 0
    ? "No role"
    : user.roles.map((role) => role.replaceAll("_", " ")).join(", ");
}

/**
 * The operational account directory.
 *
 * Every filter here is server-side. The panel used to carry a single "Search
 * this page" box that narrowed only the 25 already-fetched rows, so an account
 * on page three was unreachable from page one no matter what you typed.
 */
export function OperationalUsersPanel() {
  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [pendingUser, setPendingUser] = React.useState<AdminUser | null>(null);
  const [reason, setReason] = React.useState("");
  const [reasonError, setReasonError] = React.useState<string>();

  const [filters, setFilters] = React.useState<FilterBarValue>(EMPTY_FILTERS);
  const [loginFilter, setLoginFilter] = React.useState("all");

  // Debounced so typing a name does not fire a request per keystroke now that
  // search reaches the server.
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  React.useEffect(() => {
    setPage(0);
  }, [debouncedSearch, filters.status, filters.kind, filters.line, filters.from, filters.to, loginFilter]);

  const query: AdminUserQuery = React.useMemo(
    () => ({
      limit: LIST_PAGE_SIZE,
      offset: page * LIST_PAGE_SIZE,
      search: debouncedSearch.trim() || undefined,
      status: filters.status === "all" ? undefined : (filters.status as AdminUserQuery["status"]),
      role: filters.kind === "all" ? undefined : (filters.kind as AdminUserQuery["role"]),
      businessLine:
        filters.line === "all" ? undefined : (filters.line as AdminUserQuery["businessLine"]),
      createdFrom: filters.from || undefined,
      createdTo: filters.to || undefined,
      neverLoggedIn: loginFilter === "all" ? undefined : loginFilter === "never",
    }),
    [debouncedSearch, filters, loginFilter, page],
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getOperationalUsers(query);
    setLoading(false);
    if (result.ok) {
      setUsers(result.data.users);
      setTotal(result.data.total);
    } else {
      setError(result.error);
    }
  }, [query]);

  React.useEffect(() => void load(), [load]);

  function beginUpdate(user: AdminUser) {
    if (!ACTIONABLE_STATUSES.includes(user.status)) return;
    setReason("");
    setReasonError(undefined);
    setPendingUser(user);
  }

  async function confirmUpdate() {
    if (!pendingUser) return;
    const status = pendingUser.status === "suspended" ? "active" : "suspended";
    const validationError = requiredTextError(reason, "Reason", 500);
    setReasonError(validationError);
    if (validationError) return;
    setBusy(pendingUser.id);
    const result = await setOperationalUserStatus(pendingUser.id, {
      status,
      reason: reason.trim(),
    });
    setBusy(null);
    if (!result.ok) {
      toast.error("Could not update account", { description: result.error });
      return;
    }
    setUsers((current) => current.map((item) => (item.id === pendingUser.id ? result.data : item)));
    setPendingUser(null);
    toast.success(status === "active" ? "Account reactivated" : "Account suspended", {
      description:
        status === "active"
          ? "The user can sign in again."
          : "Active sessions have been invalidated.",
    });
  }

  const columns: DataColumn<AdminUser>[] = [
    {
      key: "name",
      header: "Account",
      cellClassName: "max-w-[18rem]",
      render: (user) => (
        <DataTablePrimaryCell
          title={`${user.first_name} ${user.last_name}`.trim() || "Unnamed account"}
          subtitle={
            user.mobile
              ? formatMobile(user.mobile)
              : (user.email ?? "Contact details removed")
          }
        />
      ),
    },
    {
      key: "roles",
      header: "Access",
      render: (user) => <span className="capitalize text-text-secondary">{displayRoles(user)}</span>,
    },
    {
      key: "client_profiles",
      header: "Profiles",
      render: (user) =>
        user.client_profiles.length === 0 ? (
          <span className="text-xs text-text-secondary">No Client profile</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {user.client_profiles.map((profile) => (
              <Badge key={profile.id} variant="outline">
                {profileLine(profile.business_line)} · {profile.status}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      key: "last_login_at",
      header: "Last sign-in",
      render: (user) => (
        <span className="tabular-nums text-text-secondary">
          {user.last_login_at ? formatDate(user.last_login_at) : "Never"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (user) => (
        <StatusBadge tone={STATUS_TONE[user.status] ?? "neutral"}>
          {user.status.replaceAll("_", " ")}
        </StatusBadge>
      ),
    },
    {
      key: "action",
      header: "Action",
      align: "right",
      render: (user) => (
        <Button
          size="sm"
          variant="outline"
          disabled={busy === user.id || !ACTIONABLE_STATUSES.includes(user.status)}
          // The row itself is not clickable — this is the only thing to do with
          // an account here, so a whole-row target would be a lie.
          onClick={() => beginUpdate(user)}
        >
          {busy === user.id ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : user.status === "suspended" ? (
            "Reactivate"
          ) : (
            "Suspend"
          )}
        </Button>
      ),
    },
  ];

  const anyFilterActive = filtersAreActive(filters) || loginFilter !== "all";

  return (
    <>
      <div className="space-y-3">
        <FilterBar
          value={filters}
          onChange={setFilters}
          searchLabel="Search accounts"
          searchPlaceholder="Name, mobile, or email"
          statusOptions={STATUS_OPTIONS}
          kindOptions={ROLE_OPTIONS}
          kindLabel="Roles"
          lineOptions={[
            { value: "loans", label: "Loans" },
            { value: "real_estate", label: "Real Estate" },
          ]}
          dateFromLabel="Created from"
          dateToLabel="Created to"
          note="Filters run against every account, not just this page."
          extra={
            <Select value={loginFilter} onValueChange={setLoginFilter}>
              <SelectTrigger aria-label="Filter by sign-in history">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any sign-in history</SelectItem>
                {LOGIN_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        {loading ? (
          <ListLoadingState />
        ) : error ? (
          <FetchError status={null} message={error} onRetry={() => void load()} />
        ) : users.length === 0 ? (
          <ListEmptyState
            icon={Users}
            title={anyFilterActive ? "No accounts match these filters" : "No accounts yet"}
            description={
              anyFilterActive
                ? "Try a different search, status, role, line, sign-in history, or created date."
                : "Provisioned staff and registered clients appear here."
            }
          />
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-border">
              <DataTable
                columns={columns}
                rows={users}
                rowKey={(user) => user.id}
                minWidth="min-w-[900px]"
              />
            </div>
            <ListPagination page={page} total={total} onPageChange={setPage} />
          </>
        )}
      </div>

      <Dialog open={pendingUser !== null} onOpenChange={(open) => !open && setPendingUser(null)}>
        <DialogContent>
          {pendingUser ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {pendingUser.status === "suspended" ? "Reactivate account" : "Suspend account"}
                </DialogTitle>
                <DialogDescription>
                  {pendingUser.first_name} {pendingUser.last_name}{" "}
                  {pendingUser.status === "suspended"
                    ? "will be able to sign in again."
                    : "will immediately lose active sessions and cannot sign in."}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="account-status-reason">
                  Reason <RequiredIndicator />
                </Label>
                <Input
                  id="account-status-reason"
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setReasonError(undefined);
                  }}
                  maxLength={500}
                  placeholder="Why is this status changing?"
                  autoFocus
                  aria-invalid={Boolean(reasonError)}
                  aria-describedby={reasonError ? "account-status-reason-error" : undefined}
                />
                <FieldError id="account-status-reason-error">{reasonError}</FieldError>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPendingUser(null)}>
                  Cancel
                </Button>
                <Button
                  variant={pendingUser.status === "suspended" ? "default" : "destructive"}
                  onClick={() => void confirmUpdate()}
                  disabled={busy === pendingUser.id}
                >
                  {busy === pendingUser.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldAlert className="h-4 w-4" />
                  )}
                  Confirm
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
