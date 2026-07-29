"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import { formatPaise } from "@/lib/format";
import { rupeesToPaise } from "@/lib/payout-form";
import type { ApiResponse } from "@/lib/api/client";
import type {
  EligibleFeeApplication,
  FeeCashbackCreate,
  FeeCashbackRead,
} from "@/lib/admin-fee-cashbacks-api";

const LINE_LABEL: Record<string, string> = { loans: "Loans", real_estate: "Real Estate" };

function paiseToRupeesInput(paise: number): string {
  return (paise / 100).toFixed(2);
}

export function FeeCashbackEntryDialog({
  application,
  onOpenChange,
  onEnter,
}: {
  application: EligibleFeeApplication | null;
  onOpenChange: (open: boolean) => void;
  onEnter: (body: FeeCashbackCreate) => Promise<ApiResponse<FeeCashbackRead>>;
}) {
  const [amountRupees, setAmountRupees] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Prefilled from the processing fee itself — the common case is refunding
  // it in full. Admin can still edit downward for a partial cashback; the
  // amount<=fee invariant (ck_fee_cashbacks_amount_le_fee in the DB) is
  // mirrored here client-side so a doomed submit never reaches the server.
  React.useEffect(() => {
    if (application) setAmountRupees(paiseToRupeesInput(application.processing_fee_paise));
  }, [application]);

  function resetAndClose() {
    setAmountRupees("");
    setNotes("");
    setError(null);
    onOpenChange(false);
  }

  async function onSubmit() {
    if (!application) return;
    const amountPaise = rupeesToPaise(amountRupees);
    if (amountPaise === null) {
      setError("Enter a valid amount greater than zero.");
      return;
    }
    if (amountPaise > application.processing_fee_paise) {
      setError("Cashback amount cannot exceed the processing fee charged.");
      return;
    }
    setError(null);
    setBusy(true);
    const res = await onEnter({
      loan_application_uuid: application.loan_application_uuid,
      amount_paise: amountPaise,
      notes: notes.trim() || undefined,
    });
    setBusy(false);

    if (res.ok) {
      toast.success("Cashback entered", {
        description: `${formatPaise(amountPaise)} recorded for ${
          application.client_name ?? "the client"
        }.`,
      });
      resetAndClose();
      return;
    }
    if (res.status === 409) {
      toast.warning("This application already has a cashback", {
        description: "Refresh the queue and check the oversight list.",
      });
      return;
    }
    toast.error("Could not enter the cashback", { description: res.error });
  }

  const previewPaise = rupeesToPaise(amountRupees);

  return (
    <Dialog
      open={application != null}
      onOpenChange={(o) => (o ? onOpenChange(true) : resetAndClose())}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enter processing-fee cashback</DialogTitle>
          <DialogDescription>
            {application
              ? `${application.client_name ?? "Unknown client"} · ${
                  LINE_LABEL[application.business_line] ?? application.business_line
                } · Fee charged: ${formatPaise(application.processing_fee_paise)}`
              : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cashback-amount">Cashback amount (₹)</Label>
            <Input
              id="cashback-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amountRupees}
              onChange={(e) => setAmountRupees(e.target.value)}
              autoFocus
            />
            {previewPaise !== null ? (
              <p className="text-xs text-text-secondary">{formatPaise(previewPaise)}</p>
            ) : null}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cashback-notes">Notes (optional)</Label>
            <Textarea
              id="cashback-notes"
              placeholder="Why a partial amount, if not the full fee"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Enter cashback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
