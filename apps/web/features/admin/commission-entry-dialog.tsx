"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
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
import { apiIssuesToFieldErrors } from "@/lib/form-validation";
import type { CommissionCreate, CommissionRead, EligibleDeal } from "@/lib/admin-commissions-api";

const LINE_LABEL: Record<string, string> = { loans: "Loans", real_estate: "Real Estate" };

export function CommissionEntryDialog({
  deal,
  onOpenChange,
  onEnter,
}: {
  deal: EligibleDeal | null;
  onOpenChange: (open: boolean) => void;
  onEnter: (body: CommissionCreate) => Promise<ApiResponse<CommissionRead>>;
}) {
  const [amountRupees, setAmountRupees] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [notesError, setNotesError] = React.useState<string>();
  const [busy, setBusy] = React.useState(false);

  function resetAndClose() {
    setAmountRupees("");
    setNotes("");
    setError(null);
    setNotesError(undefined);
    onOpenChange(false);
  }

  async function onSubmit() {
    if (!deal) return;
    const amountPaise = rupeesToPaise(amountRupees);
    if (amountPaise === null) {
      setError("Enter a valid amount greater than zero.");
      return;
    }
    if (notes.trim().length > 1000) {
      setNotesError("Notes must be 1000 characters or fewer.");
      return;
    }
    setError(null);
    setBusy(true);
    const res = await onEnter({
      deal_type: deal.deal_type,
      deal_uuid: deal.deal_uuid,
      agreed_amount_paise: amountPaise,
      notes: notes.trim() || undefined,
    });
    setBusy(false);

    if (res.ok) {
      toast.success("Commission entered", {
        description: `${formatPaise(amountPaise)} recorded for ${deal.agent_code}.`,
      });
      resetAndClose();
      return;
    }
    if (res.status === 409) {
      toast.warning("This deal already has a commission", {
        description: "Refresh the queue and check the oversight list.",
      });
      return;
    }
    const serverErrors = apiIssuesToFieldErrors(res.issues, {
      agreed_amount_paise: "amount",
      notes: "notes",
    });
    if (serverErrors.amount) setError(serverErrors.amount);
    if (serverErrors.notes) setNotesError(serverErrors.notes);
    toast.error("Could not enter the commission", { description: res.error });
  }

  const previewPaise = rupeesToPaise(amountRupees);

  return (
    <Dialog open={deal != null} onOpenChange={(o) => (o ? onOpenChange(true) : resetAndClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enter commission</DialogTitle>
          <DialogDescription>
            {deal
              ? `${deal.agent_name ?? "Unknown agent"} · ${deal.agent_code} · ${
                  LINE_LABEL[deal.business_line] ?? deal.business_line
                }`
              : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="commission-amount">Agreed amount (₹)</Label>
            <Input
              id="commission-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amountRupees}
              onChange={(e) => { setAmountRupees(e.target.value); setError(null); }}
              autoFocus
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "commission-amount-error" : undefined}
            />
            {previewPaise !== null ? (
              <p className="text-xs text-text-secondary">{formatPaise(previewPaise)}</p>
            ) : null}
            <FieldError id="commission-amount-error" className="text-xs">{error ?? undefined}</FieldError>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="commission-notes">Notes (optional)</Label>
            <Textarea
              id="commission-notes"
              placeholder="How the amount was negotiated"
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setNotesError(undefined); }}
              rows={3}
              maxLength={1000}
              aria-invalid={Boolean(notesError)}
              aria-describedby={notesError ? "commission-notes-error" : undefined}
            />
            <FieldError id="commission-notes-error" className="text-xs">{notesError}</FieldError>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Enter commission
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
