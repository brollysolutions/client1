"use client";

import * as React from "react";
import { Loader2, RefreshCw, Search, ShieldAlert } from "lucide-react";
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
import { requiredTextError } from "@/lib/form-validation";
import {
  getOperationalUsers,
  setOperationalUserStatus,
  type AdminUser,
} from "@/lib/admin-users-api";

const PAGE_SIZE = 25;

function profileLine(line: "loans" | "real_estate"): string {
  return line === "real_estate" ? "Real Estate" : "Loans";
}

function displayRoles(user: AdminUser): string {
  return user.roles.map((role) => role.replaceAll("_", " ")).join(", ");
}

export function OperationalUsersPanel() {
  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [total, setTotal] = React.useState(0);
  const [offset, setOffset] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [pendingUser, setPendingUser] = React.useState<AdminUser | null>(null);
  const [reason, setReason] = React.useState("");
  const [reasonError, setReasonError] = React.useState<string>();

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getOperationalUsers(PAGE_SIZE, offset);
    setLoading(false);
    if (result.ok) {
      setUsers(result.data.users);
      setTotal(result.data.total);
    } else setError(result.error);
  }, [offset]);

  React.useEffect(() => void load(), [load]);

  const filteredUsers = users.filter((user) => {
    const haystack = [
      user.first_name,
      user.last_name,
      user.mobile ?? "",
      user.email ?? "",
      ...user.roles,
    ].join(" ").toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  function beginUpdate(user: AdminUser) {
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
    const result = await setOperationalUserStatus(pendingUser.id, { status, reason: reason.trim() });
    setBusy(null);
    if (!result.ok) {
      toast.error("Could not update account", { description: result.error });
      return;
    }
    setUsers((current) => current.map((item) => (item.id === pendingUser.id ? result.data : item)));
    setPendingUser(null);
    toast.success(status === "active" ? "Account reactivated" : "Account suspended", {
      description: status === "active" ? "The user can sign in again." : "Active sessions have been invalidated.",
    });
  }

  if (loading) {
    return <div className="flex min-h-32 items-center gap-2 text-sm text-text-secondary" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading accounts…</div>;
  }
  if (error) {
    return <div className="rounded-xl border border-border p-6 text-center" role="alert"><p className="text-sm text-text-secondary">{error}</p><Button className="mt-4" size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" aria-hidden="true" />Try again</Button></div>;
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:w-72"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-text-secondary" aria-hidden="true" /><Input aria-label="Search accounts on this page" className="pl-9" value={query} maxLength={100} onChange={(event) => setQuery(event.target.value)} placeholder="Search this page" /></div>
          <p className="text-xs text-text-secondary">{total === 0 ? "No accounts" : `Showing ${offset + 1}-${offset + users.length} of ${total}`}</p>
        </div>
        {filteredUsers.length === 0 ? <p className="py-8 text-center text-sm text-text-secondary">No accounts match this page.</p> : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-text-secondary"><tr><th className="px-4 py-3">Account</th><th className="px-4 py-3">Access</th><th className="px-4 py-3">Profiles</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
              <tbody>{filteredUsers.map((user) => <tr key={user.id} className="border-b border-border align-top last:border-0"><td className="px-4 py-3"><p className="font-medium text-text-primary">{user.first_name} {user.last_name}</p><p className="mt-1 text-xs text-text-secondary">{user.mobile ?? user.email ?? "Contact details removed"}</p></td><td className="px-4 py-3"><p className="capitalize text-text-primary">{displayRoles(user)}</p><p className="mt-1 text-xs text-text-secondary">{user.email && user.mobile ? user.email : ""}</p></td><td className="px-4 py-3">{user.client_profiles.length === 0 ? <span className="text-xs text-text-secondary">No Client profile</span> : <div className="flex flex-wrap gap-1.5">{user.client_profiles.map((profile) => <Badge key={profile.id} variant="outline">{profileLine(profile.business_line)} · {profile.status}</Badge>)}</div>}</td><td className="px-4 py-3"><Badge variant="outline" className="capitalize">{user.status.replaceAll("_", " ")}</Badge></td><td className="px-4 py-3 text-right"><Button size="sm" variant="outline" disabled={busy === user.id || !["active", "suspended"].includes(user.status)} onClick={() => beginUpdate(user)}>{busy === user.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : user.status === "suspended" ? "Reactivate" : "Suspend"}</Button></td></tr>)}</tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end gap-2"><Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}>Previous</Button><Button size="sm" variant="outline" disabled={offset + users.length >= total} onClick={() => setOffset((current) => current + PAGE_SIZE)}>Next</Button></div>
      </div>
      <Dialog open={pendingUser !== null} onOpenChange={(open) => !open && setPendingUser(null)}>
        <DialogContent>{pendingUser ? <><DialogHeader><DialogTitle>{pendingUser.status === "suspended" ? "Reactivate account" : "Suspend account"}</DialogTitle><DialogDescription>{pendingUser.first_name} {pendingUser.last_name} {pendingUser.status === "suspended" ? "will be able to sign in again." : "will immediately lose active sessions and cannot sign in."}</DialogDescription></DialogHeader><div className="grid gap-2"><Label htmlFor="account-status-reason">Reason <RequiredIndicator /></Label><Input id="account-status-reason" value={reason} onChange={(event) => { setReason(event.target.value); setReasonError(undefined); }} maxLength={500} placeholder="Why is this status changing?" autoFocus aria-invalid={Boolean(reasonError)} aria-describedby={reasonError ? "account-status-reason-error" : undefined} /><FieldError id="account-status-reason-error">{reasonError}</FieldError></div><DialogFooter><Button variant="outline" onClick={() => setPendingUser(null)}>Cancel</Button><Button variant={pendingUser.status === "suspended" ? "default" : "destructive"} onClick={() => void confirmUpdate()} disabled={busy === pendingUser.id}>{busy === pendingUser.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}Confirm</Button></DialogFooter></> : null}</DialogContent>
      </Dialog>
    </>
  );
}
