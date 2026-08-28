"use client";

import * as React from "react";
import { Check, Copy, Link2, Loader2, Share2, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { ApiResponse } from "@/lib/api/client";
import {
  createStaffInviteLink,
  revokeStaffInviteLink,
  type StaffInviteLink,
} from "@/lib/staff-invites";
import { formatDate } from "@/lib/format";

/**
 * The credential handoff shown once after provisioning.
 *
 * The temp password is still generated and still shown — an Admin without a way
 * to reach the person needs it — but the invite link is the primary route now.
 * Sending a link means the password is never spoken aloud, pasted into a chat,
 * or left sitting in an Admin's clipboard, and it can be revoked if the handoff
 * goes wrong, which a spoken password cannot.
 *
 * Staff links use `authUserUuid`; other account types can supply the same
 * create/revoke behavior through `inviteLinkActions` without coupling this
 * security-sensitive handoff UI to a specific endpoint.
 *
 * `tempPassword` is optional for the mirror case: reopening an existing staff
 * account long after provisioning. The one-time password is never stored, so it
 * can never be shown again — only the link half of the handoff is reachable.
 */
export function TempCredentialPanel({
  mobile,
  tempPassword,
  authUserUuid,
  inviteLinkActions,
  autoCreate = false,
}: {
  mobile: string;
  tempPassword?: string;
  authUserUuid?: string;
  inviteLinkActions?: {
    create: () => Promise<ApiResponse<StaffInviteLink>>;
    revoke: (linkId: string) => Promise<ApiResponse<null>>;
  };
  /** Request the setup link as soon as a newly provisioned account is shown. */
  autoCreate?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);
  const [link, setLink] = React.useState<StaffInviteLink | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [blocked, setBlocked] = React.useState<string | null>(null);
  const canCreateLink = Boolean(authUserUuid || inviteLinkActions);
  const autoCreateStarted = React.useRef(false);

  async function copyPassword() {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the password is still selectable/readable below */
    }
  }

  const createLink = React.useCallback(async (shareAfterCreate = true) => {
    if (!authUserUuid && !inviteLinkActions) return;
    setBusy(true);
    const response = inviteLinkActions
      ? await inviteLinkActions.create()
      : await createStaffInviteLink(authUserUuid!);
    setBusy(false);
    if (!response.ok) {
      // 409 is the deliberate rule, not a failure: once someone has set their own
      // password an Admin-minted link would be an account-takeover primitive.
      if (response.status === 409) {
        setBlocked(response.error);
        return;
      }
      toast.error("Couldn't create the invite link", { description: response.error });
      return;
    }
    setBlocked(null);
    setLink(response.data);
    const url = `${window.location.origin}${response.data.share_path}`;
    if (shareAfterCreate && navigator.share) {
      try {
        await navigator.share({ title: "Set up your Dhanadhara account", url });
      } catch {
        // A cancelled native share leaves the copyable link visible below.
      }
    }
  }, [authUserUuid, inviteLinkActions]);

  React.useEffect(() => {
    if (!autoCreate || !canCreateLink || autoCreateStarted.current) return;
    autoCreateStarted.current = true;
    void createLink(false);
  }, [autoCreate, canCreateLink, createLink]);

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${link.share_path}`);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy the link", {
        description: "Copy it from your browser's share menu instead.",
      });
    }
  }

  async function shareLink() {
    if (!link) return;
    const url = `${window.location.origin}${link.share_path}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Set up your Dhanadhara account", url });
        return;
      } catch {
        // A cancelled native share leaves the copy and revoke actions available.
        return;
      }
    }
    await copyLink();
  }

  async function revoke() {
    if (!link) return;
    setBusy(true);
    const response = inviteLinkActions
      ? await inviteLinkActions.revoke(link.id)
      : await revokeStaffInviteLink(link.id);
    setBusy(false);
    if (response.ok) {
      setLink(null);
      toast.success("Invite link revoked");
    } else {
      toast.error("Couldn't revoke the link", { description: response.error });
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-brand-cta/30 bg-brand-cta/5 p-4">
      {canCreateLink ? (
        <div>
          <div className="flex items-start gap-2">
            <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-cta" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary">
                Account setup link
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                They set their own password, so nothing has to be relayed. The link works once,
                expires after seven days, and you can revoke it.
              </p>

              {blocked ? (
                <p className="mt-3 rounded-lg border border-border bg-card px-3 py-2 text-xs text-text-secondary">
                  {blocked}
                </p>
              ) : link ? (
                <div className="mt-3 space-y-2">
                  <code className="block truncate rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm text-text-primary">
                    {link.share_path}
                  </code>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => void copyLink()}>
                      <Copy className="h-4 w-4" aria-hidden="true" />
                      Copy link
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void shareLink()}
                    >
                      <Share2 className="h-4 w-4" aria-hidden="true" />
                      Share
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void revoke()}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      )}
                      Revoke
                    </Button>
                    <span className="text-xs text-text-secondary">
                      Expires {formatDate(link.expires_at)}
                    </span>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="mt-3"
                  disabled={busy}
                  onClick={() => void createLink(false)}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Link2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  Retry setup link
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {tempPassword ? (
        <div className={canCreateLink ? "border-t border-brand-cta/20 pt-4" : undefined}>
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-brand-cta" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary">Legacy password fallback</p>
              <p className="mt-1 text-xs text-text-secondary">
                This password will not be shown again. Share it with {mobile} out of band; they will
                be forced to set a new password on first login.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm text-text-primary">
                  {tempPassword}
                </code>
                <Button type="button" variant="outline" size="sm" onClick={() => void copyPassword()}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={canCreateLink ? "border-t border-brand-cta/20 pt-4" : undefined}>
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
            <p className="text-xs text-text-secondary">
              The one-time password issued when this account was created is not stored anywhere and
              cannot be shown again. Send {mobile} a setup link instead.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
