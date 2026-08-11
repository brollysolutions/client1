"use client";

import * as React from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getOperationalUsers,
  setOperationalUserStatus,
  type AdminUser,
} from "@/lib/admin-users-api";

function profileLine(line: "loans" | "real_estate"): string {
  return line === "real_estate" ? "Real Estate" : "Loans";
}

export function OperationalUsersPanel() {
  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getOperationalUsers();
    setLoading(false);
    if (result.ok) setUsers(result.data.users);
    else setError(result.error);
  }, []);

  React.useEffect(() => void load(), [load]);

  async function update(user: AdminUser) {
    const status = user.status === "suspended" ? "active" : "suspended";
    const reason = window.prompt(
      `Reason for ${status === "active" ? "reactivating" : "suspending"} this account:`,
    );
    if (!reason?.trim()) return;
    setBusy(user.id);
    const result = await setOperationalUserStatus(user.id, {
      status,
      reason: reason.trim(),
    });
    setBusy(null);
    if (!result.ok) {
      toast.error("Could not update account", { description: result.error });
      return;
    }
    setUsers((current) =>
      current.map((item) => (item.id === user.id ? result.data : item)),
    );
    toast.success(status === "active" ? "Account reactivated" : "Account suspended");
  }

  if (loading) {
    return (
      <div className="flex min-h-32 items-center gap-2 text-sm text-text-secondary" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading accounts…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border p-6 text-center" role="alert">
        <p className="text-sm text-text-secondary">{error}</p>
        <Button className="mt-4" size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      </div>
    );
  }

  if (users.length === 0) {
    return <p className="py-8 text-center text-sm text-text-secondary">No accounts found.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-text-secondary">
          <tr>
            <th className="px-4 py-3">Account</th>
            <th className="px-4 py-3">Client profiles</th>
            <th className="px-4 py-3">Roles</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b border-border align-top last:border-0">
              <td className="px-4 py-3">
                <p className="font-medium text-text-primary">
                  {user.first_name} {user.last_name}
                </p>
                {user.mobile || user.email ? (
                  <div className="mt-1 space-y-0.5 text-xs text-text-secondary">
                    {user.mobile ? <p>{user.mobile}</p> : null}
                    {user.email ? <p>{user.email}</p> : null}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-text-secondary">Contact details removed</p>
                )}
              </td>
              <td className="px-4 py-3">
                {user.client_profiles.length === 0 ? (
                  <span className="text-xs text-text-secondary">None</span>
                ) : (
                  <ul className="space-y-2">
                    {user.client_profiles.map((profile) => (
                      <li key={profile.id}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline">{profileLine(profile.business_line)}</Badge>
                          <Badge variant="outline">{profile.status}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-text-secondary">
                          {profile.customer_code}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="px-4 py-3">
                {user.roles.map((role) => (
                  <Badge className="mb-1 mr-1" key={role} variant="outline">
                    {role.replaceAll("_", " ")}
                  </Badge>
                ))}
              </td>
              <td className="px-4 py-3">
                <Badge variant="outline">{user.status.replaceAll("_", " ")}</Badge>
              </td>
              <td className="px-4 py-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === user.id || !["active", "suspended"].includes(user.status)}
                  onClick={() => void update(user)}
                >
                  {busy === user.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : user.status === "suspended" ? (
                    "Reactivate"
                  ) : (
                    "Suspend"
                  )}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
