"use client";

import * as React from "react";
import { Check, Copy, Link2, Loader2, Share2, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
 * `authUserUuid` is optional because the agent-approval flow reuses this panel
 * and issues agent codes, not staff invites; without it the link controls are
 * simply absent.
 */
export function TempCredentialPanel({
  mobile,
  tempPassword,
  authUserUuid,
}: {
  mobile: string;
  tempPassword: string;
  authUserUuid?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const [link, setLink] = React.useState<StaffInviteLink | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the password is still selectable/readable below */
    }
  }

  async function createLink() {
    if (!authUserUuid) return;
    setBusy(true);
    const response = await createStaffInviteLink(authUserUuid);
    setBusy(false);
    if (!response.ok) {
      toast.error("Couldn't create the invite link", { description: response.error });
      return;
    }
    setLink(response.data);
    const url = `${window.location.origin}${response.data.share_path}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Set up your Dhanadhara account", url });
      } catch {
        // A cancelled native share leaves the copyable link visible below.
      }
    }
  }

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
    const response = await revokeStaffInviteLink(link.id);
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
      {authUserUuid ? (
        <div>
          <div className="flex items-start gap-2">
            <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-cta" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary">
                Send an invite link instead
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                They set their own password, so nothing has to be relayed. The link works once,
                expires after seven days, and you can revoke it.
              </p>

              {link ? (
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
                  onClick={() => void createLink()}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Link2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  Create invite link
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className={authUserUuid ? "border-t border-brand-cta/20 pt-4" : undefined}>
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-brand-cta" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text-primary">Shown once. Share it securely.</p>
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
    </div>
  );
}
