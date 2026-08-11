"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getOperationalUsers, setOperationalUserStatus, type AdminUser } from "@/lib/admin-users-api";

export function OperationalUsersPanel() {
  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    setLoading(true);
    const result = await getOperationalUsers();
    setLoading(false);
    if (result.ok) setUsers(result.data.users);
    else toast.error("Could not load accounts", { description: result.error });
  }, []);
  React.useEffect(() => void load(), [load]);
  async function update(user: AdminUser) {
    const status = user.status === "suspended" ? "active" : "suspended";
    const reason = window.prompt(`Reason for ${status === "active" ? "reactivating" : "suspending"} this account:`);
    if (!reason?.trim()) return;
    setBusy(user.id);
    const result = await setOperationalUserStatus(user.id, { status, reason: reason.trim() });
    setBusy(null);
    if (!result.ok) return toast.error("Could not update account", { description: result.error });
    setUsers((current) => current.map((item) => (item.id === user.id ? result.data : item)));
    toast.success(status === "active" ? "Account reactivated" : "Account suspended");
  }
  if (loading) return <div className="flex min-h-32 items-center gap-2 text-sm text-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…</div>;
  return <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-text-secondary"><tr><th className="px-4 py-3">Account</th><th className="px-4 py-3">Roles</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead><tbody>{users.map((user) => <tr key={user.id} className="border-b border-border last:border-0"><td className="px-4 py-3"><p className="font-medium text-text-primary">{user.first_name} {user.last_name}</p><p className="text-xs text-text-secondary">{user.mobile}</p></td><td className="px-4 py-3">{user.roles.map((role) => <Badge className="mr-1" key={role} variant="outline">{role}</Badge>)}</td><td className="px-4 py-3"><Badge variant="outline">{user.status.replaceAll("_", " ")}</Badge></td><td className="px-4 py-3"><Button size="sm" variant="outline" disabled={busy === user.id || !["active", "suspended"].includes(user.status)} onClick={() => void update(user)}>{busy === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : user.status === "suspended" ? "Reactivate" : "Suspend"}</Button></td></tr>)}</tbody></table></div>;
}
