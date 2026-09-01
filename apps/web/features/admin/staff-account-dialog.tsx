"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  PANEL_DIALOG_CLASS,
  WorkspaceDialogHeader,
  WorkspaceLayout,
} from "@/features/dashboard/workspace-dialog";
import { StatusBadge, type StatusTone } from "@/features/dashboard/status-badge";
import { formatDate } from "@/lib/format";
import { formatMobile } from "@/lib/phone";
import type { AdminUser } from "@/lib/admin-users-api";

import { TempCredentialPanel } from "./temp-credential-panel";

/** Roles that get a StaffProfile, and therefore a setup link. */
const STAFF_ROLES: readonly string[] = ["admin", "sub_admin", "telecaller", "employee"];

const STATUS_TONE: Record<string, StatusTone> = {
  active: "success",
  suspended: "danger",
  pending_password_reset: "warning",
  soft_deleted: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  suspended: "Suspended",
  pending_password_reset: "Awaiting password setup",
  soft_deleted: "Deleted",
};

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">{label}</dt>
      <dd className="mt-1 text-sm leading-6 text-text-primary">{value}</dd>
    </div>
  );
}

/**
 * One staff or client account, reopened from the directory.
 *
 * Provisioning used to be the only moment an Admin could reach the setup link:
 * skip it there and the account became unreachable, with no way back to the
 * handoff. The link half of `TempCredentialPanel` lives here too so re-issuing
 * is always one row click away. The temp password half cannot follow — it is
 * never stored — so this surface is deliberately link-only.
 */
export function StaffAccountDialog({
  user,
  open,
  onOpenChange,
  onStatusAction,
  statusActionLabel,
  statusActionDisabled,
  busy,
}: {
  user: AdminUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusAction: (user: AdminUser) => void;
  statusActionLabel: string;
  statusActionDisabled: boolean;
  busy: boolean;
}) {
  const isStaff = user != null && user.roles.some((role) => STAFF_ROLES.includes(role));
  const name = user ? `${user.first_name} ${user.last_name}`.trim() : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className={PANEL_DIALOG_CLASS}>
        {user ? (
          <>
            <WorkspaceDialogHeader
              title={name || "Unnamed account"}
              description={
                user.roles.length > 0
                  ? user.roles.map((role) => role.replaceAll("_", " ")).join(", ")
                  : "No role assigned"
              }
              closeLabel="Close account"
              actions={
                <>
                  <StatusBadge tone={STATUS_TONE[user.status] ?? "neutral"}>
                    {STATUS_LABEL[user.status] ?? user.status.replaceAll("_", " ")}
                  </StatusBadge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={statusActionDisabled || busy}
                    onClick={() => onStatusAction(user)}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    {statusActionLabel}
                  </Button>
                </>
              }
            />

            <WorkspaceLayout
              editor={
                <div className="space-y-5 pb-2">
                  <section className="rounded-xl border border-border bg-card p-5">
                    <h2 className="font-semibold text-text-primary">Account</h2>
                    <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                      <Fact
                        label="Mobile"
                        value={user.mobile ? formatMobile(user.mobile) : "Removed"}
                      />
                      <Fact label="Email" value={user.email ?? "Not set"} />
                      <Fact label="Created" value={formatDate(user.created_at)} />
                      <Fact
                        label="Last signed in"
                        value={
                          user.last_login_at ? formatDate(user.last_login_at) : "Never signed in"
                        }
                      />
                    </dl>
                  </section>

                  {isStaff ? (
                    <TempCredentialPanel
                      mobile={user.mobile ? formatMobile(user.mobile) : "this user"}
                      authUserUuid={user.id}
                    />
                  ) : (
                    <p className="rounded-xl border border-border bg-card p-5 text-sm leading-6 text-text-secondary">
                      Setup links are for staff accounts. This account signs in through the normal
                      registration and password-reset flows.
                    </p>
                  )}
                </div>
              }
            />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
