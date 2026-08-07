"use client";

import * as React from "react";
import { ArrowRight, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  completeMobileChange,
  listMobileChangeRequests,
  rejectMobileChange,
  verifyMobileChangeIdentity,
  type MobileChangeAdmin,
  type MobileChangeProof,
} from "@/lib/admin-api";

const PROOF_LABEL: Record<MobileChangeProof, string> = {
  verified_email: "Verified account email",
  existing_kyc: "Existing approved KYC",
  staff_confirmation: "Staff / manager confirmation",
  in_person: "In-person branch verification",
};

const STATUS_LABEL: Record<MobileChangeAdmin["status"], string> = {
  pending_review: "Identity review",
  pending_approval: "Final approval",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  expired: "Expired",
};

const CONFLICT_LABEL: Record<string, string> = {
  account_inactive: "The target account is no longer active.",
  administrator_account: "Administrator accounts cannot use this workflow.",
  current_number_changed: "The account number changed after this request started.",
  replacement_number_in_use: "The replacement number already belongs to an account.",
  replacement_number_has_unlinked_lead:
    "The replacement number is attached to an unrelated lead.",
  replacement_number_has_unlinked_referral:
    "The replacement number is attached to an unrelated referral.",
  replacement_number_has_unlinked_application:
    "The replacement number is attached to an unrelated agent application.",
  request_data_unavailable: "The request no longer retains change data.",
  selected_proof_not_available:
    "The selected proof is not verified on this account. Choose another method.",
};

const ACTIVE = new Set<MobileChangeAdmin["status"]>([
  "pending_review",
  "pending_approval",
]);

export function MobileChangeQueue() {
  const [items, setItems] = React.useState<MobileChangeAdmin[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<MobileChangeAdmin | null>(null);
  const [proof, setProof] = React.useState<MobileChangeProof | "">("");
  const [attestation, setAttestation] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState<"verify" | "complete" | "reject" | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const response = await listMobileChangeRequests();
    if (response.ok) setItems(response.data);
    else setError(response.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const openItems = items.filter((item) => ACTIVE.has(item.status));

  function close() {
    setActive(null);
    setProof("");
    setAttestation("");
    setPassword("");
    setReason("");
  }

  async function act(kind: "verify" | "complete" | "reject") {
    if (!active || busy) return;
    setBusy(kind);
    const response =
      kind === "verify"
        ? await verifyMobileChangeIdentity(active.id, {
            proof_method: proof as MobileChangeProof,
            proof_attestation: attestation.trim(),
            current_password: password,
          })
        : kind === "complete"
          ? await completeMobileChange(active.id, password)
          : await rejectMobileChange(active.id, reason.trim(), password);
    setBusy(null);
    if (!response.ok) {
      toast.error("Could not update this request", { description: response.error });
      return;
    }
    toast.success(
      kind === "verify"
        ? "Identity evidence recorded"
        : kind === "complete"
          ? "Login number changed and sessions revoked"
          : "Request rejected",
    );
    close();
    void load();
  }

  return (
    <section className="space-y-3 rounded-2xl border border-brand-cta/25 bg-brand-cta-tint/25 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand-cta" />
            <h2 className="font-semibold text-text-primary">Mobile-number reviews</h2>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            A different Admin must perform final approval after identity verification.
          </p>
        </div>
        {openItems.length > 0 ? (
          <Badge className="bg-warning/10 text-warning">{openItems.length} open</Badge>
        ) : null}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-brand-cta" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-text-secondary">
          <p>{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : openItems.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card/60 p-5 text-sm text-text-secondary">
          No mobile-number changes are waiting for review.
        </p>
      ) : (
        <ul className="space-y-2">
          {openItems.map((request) => (
            <li key={request.id}>
              <button
                type="button"
                onClick={() => setActive(request)}
                className="flex w-full flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-brand-cta sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-text-primary">
                    {request.requester_name} · {request.requester_role.replace("_", " ")}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-sm text-text-secondary">
                    <span>{request.current_mobile}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                    <span>{request.requested_mobile}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {request.conflicts.length > 0 ? (
                    <Badge variant="destructive">Conflict</Badge>
                  ) : null}
                  <Badge variant="outline">{STATUS_LABEL[request.status]}</Badge>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={active !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-xl">
          {active ? (
            <>
              <DialogHeader>
                <DialogTitle>{STATUS_LABEL[active.status]}</DialogTitle>
                <DialogDescription>
                  {active.requester_name} · {active.current_mobile} → {active.requested_mobile}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {active.conflicts.length > 0 ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                      <TriangleAlert className="h-4 w-4" />
                      Resolve before continuing
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-secondary">
                      {active.conflicts.map((conflict) => (
                        <li key={conflict}>{CONFLICT_LABEL[conflict] ?? conflict}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {active.status === "pending_review" ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="proof-method">Identity proof used</Label>
                      <Select
                        value={proof}
                        onValueChange={(value) => setProof(value as MobileChangeProof)}
                      >
                        <SelectTrigger id="proof-method">
                          <SelectValue placeholder="Choose an approved proof" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(PROOF_LABEL).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="attestation">PII-free internal reference</Label>
                      <Textarea
                        id="attestation"
                        value={attestation}
                        onChange={(event) => setAttestation(event.target.value)}
                        placeholder="Example: branch-visit-case-84 (no phone, email, or KYC number)"
                        maxLength={300}
                      />
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                    <p className="font-medium text-text-primary">
                      {active.proof_method ? PROOF_LABEL[active.proof_method] : "Proof recorded"}
                    </p>
                    <p className="mt-1 text-text-secondary">
                      {active.proof_attestation} · verified by {active.verified_by_name}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="admin-password">Your current Admin password</Label>
                  <Input
                    id="admin-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                  />
                  <p className="text-xs text-text-secondary">
                    Required for identity verification and final completion.
                  </p>
                </div>

                <div className="space-y-2 border-t border-border pt-4">
                  <Label htmlFor="reject-reason">PII-free rejection reason</Label>
                  <Textarea
                    id="reject-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Required only when rejecting; do not include contact or KYC details"
                    maxLength={500}
                  />
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  variant="outline"
                  onClick={() => void act("reject")}
                  disabled={busy !== null || reason.trim().length < 3 || !password}
                >
                  {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Reject
                </Button>
                {active.status === "pending_review" ? (
                  <Button
                    onClick={() => void act("verify")}
                    disabled={
                      busy !== null ||
                      active.conflicts.length > 0 ||
                      !proof ||
                      attestation.trim().length < 3 ||
                      !password
                    }
                  >
                    {busy === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Record identity proof
                  </Button>
                ) : (
                  <Button
                    onClick={() => void act("complete")}
                    disabled={busy !== null || active.conflicts.length > 0 || !password}
                  >
                    {busy === "complete" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Complete and revoke sessions
                  </Button>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
