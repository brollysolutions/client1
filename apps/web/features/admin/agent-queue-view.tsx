"use client";

import * as React from "react";
import { CheckCircle2, Inbox, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  approveAgentApplication,
  rejectAgentApplication,
  type AgentApplication,
} from "@/lib/admin-api";
import { TempCredentialPanel } from "./temp-credential-panel";
import { useAgentQueue } from "./use-agent-queue";

export function AgentQueueView() {
  const { items, loading, error, reload } = useAgentQueue();
  const [active, setActive] = React.useState<AgentApplication | null>(null);
  const [rejecting, setRejecting] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [approved, setApproved] = React.useState<{
    mobile: string;
    agentCode: string;
    tempPassword: string | null;
  } | null>(null);

  async function onApprove(app: AgentApplication) {
    setBusy(true);
    const res = await approveAgentApplication(app.id);
    setBusy(false);
    if (res.ok) {
      toast.success("Agent approved", { description: `${res.data.agent_code} is now active.` });
      setApproved({
        mobile: app.mobile ?? "the applicant",
        agentCode: res.data.agent_code,
        tempPassword: res.data.temp_password,
      });
      setActive(null);
      void reload();
    } else {
      toast.error("Could not approve", { description: res.error });
    }
  }

  async function onReject(app: AgentApplication) {
    if (note.trim().length === 0) {
      toast.error("Add a reason", { description: "Tell the applicant why this was rejected." });
      return;
    }
    setBusy(true);
    const res = await rejectAgentApplication(app.id, note.trim());
    setBusy(false);
    if (res.ok) {
      toast.success("Application rejected");
      setActive(null);
      setRejecting(false);
      setNote("");
      void reload();
    } else {
      toast.error("Could not reject", { description: res.error });
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Agent applications</h1>
        <p className="text-sm text-text-secondary">
          Approve a pending application into a live agent account, or reject it with a reason.
        </p>
      </div>

      {approved ? (
        <div className="space-y-3">
          {approved.tempPassword ? (
            <TempCredentialPanel mobile={approved.mobile} tempPassword={approved.tempPassword} />
          ) : (
            <p className="rounded-xl border border-border bg-card p-4 text-sm text-text-secondary">
              {approved.agentCode} is active. This applicant already had an account, their
              existing password still works.
            </p>
          )}
          <Button variant="outline" size="sm" onClick={() => setApproved(null)}>
            Dismiss
          </Button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border bg-card py-16">
          <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-text-secondary">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
          <Inbox className="h-8 w-8 text-text-secondary" aria-hidden="true" />
          <p className="mt-3 font-medium text-text-primary">No applications awaiting review</p>
          <p className="mt-1 text-sm text-text-secondary">
            New agent applications will show up here for approval.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((app) => (
            <li key={app.id}>
              <button
                type="button"
                onClick={() => {
                  setActive(app);
                  setRejecting(false);
                  setNote("");
                }}
                className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-brand-cta"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-primary">
                    {app.first_name} {app.last_name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-text-secondary">{app.mobile}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {app.rera_code ? (
                    <span className="text-xs text-text-secondary">{app.rera_code}</span>
                  ) : null}
                  <Badge variant="secondary">Pending</Badge>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-lg">
          {active ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {active.first_name} {active.last_name}
                </DialogTitle>
                <DialogDescription>{active.mobile}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-text-secondary">Business line</dt>
                    <dd className="font-medium text-text-primary">
                      {active.business_line === "loans" ? "Loans" : "Real Estate"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-secondary">RERA code</dt>
                    <dd className="font-medium text-text-primary">{active.rera_code ?? "—"}</dd>
                  </div>
                </dl>

                {rejecting ? (
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Reason for rejection"
                    rows={3}
                  />
                ) : null}
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                {rejecting ? (
                  <>
                    <Button variant="ghost" onClick={() => setRejecting(false)} disabled={busy}>
                      Back
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => void onReject(active)}
                      disabled={busy}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      Confirm reject
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setRejecting(true)} disabled={busy}>
                      Reject
                    </Button>
                    <Button onClick={() => void onApprove(active)} disabled={busy}>
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Approve
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
