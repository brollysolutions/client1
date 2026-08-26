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
import type { ApiResponse } from "@/lib/api/client";
import { apiIssuesToFieldErrors, focusFirstInvalidField } from "@/lib/form-validation";
import { formatPaise } from "@/lib/format";
import {
  buildCommissionPayoutPayload,
  EMPTY_COMMISSION_PAYOUT_FORM,
  validateCommissionPayoutForm,
  type CommissionPayoutFormState,
} from "@/lib/commission-payout-form";
import type { CommissionPayoutRequest, CommissionRead } from "@/lib/admin-commissions-api";
import { PayoutDestinationFields } from "./payout-destination-fields";

export function CommissionPayoutDialog({
  commission,
  onOpenChange,
  onPay,
}: {
  commission: CommissionRead | null;
  onOpenChange: (open: boolean) => void;
  onPay: (commissionId: string, body: CommissionPayoutRequest) => Promise<ApiResponse<unknown>>;
}) {
  const [form, setForm] = React.useState<CommissionPayoutFormState>(EMPTY_COMMISSION_PAYOUT_FORM);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);

  function resetAndClose() {
    setForm(EMPTY_COMMISSION_PAYOUT_FORM);
    setErrors({});
    onOpenChange(false);
  }

  function set<K extends keyof CommissionPayoutFormState>(
    key: K,
    value: CommissionPayoutFormState[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function showErrors(next: Record<string, string>) {
    setErrors(next);
    if (Object.keys(next).length > 0) {
      requestAnimationFrame(() => {
        if (contentRef.current) focusFirstInvalidField(contentRef.current);
      });
    }
  }

  async function onSubmit() {
    if (!commission) return;
    const errs = validateCommissionPayoutForm(form);
    showErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const payload = buildCommissionPayoutPayload(form);

    setBusy(true);
    const res = await onPay(commission.id, payload);
    setBusy(false);

    if (res.ok) {
      toast.success("Payout raised", { description: "Awaiting a different admin's approval." });
      resetAndClose();
      return;
    }
    if (res.status === 409) {
      toast.warning("This commission may already have a payout", {
        description: "Close this and check the list before trying again.",
      });
      return;
    }
    const serverErrors = apiIssuesToFieldErrors(res.issues, {
      destination_type: "destinationType",
      "destination.vpa": "vpa",
      "destination.ifsc": "ifsc",
      "destination.account_number": "accountNumber",
    });
    if (Object.keys(serverErrors).length > 0) showErrors(serverErrors);
    toast.error("Could not raise the payout", { description: res.error });
  }

  return (
    <Dialog
      open={commission !== null}
      onOpenChange={(o) => (o ? undefined : resetAndClose())}
    >
      <DialogContent ref={contentRef} className="max-w-lg">
        {commission !== null ? (
          <>
            <DialogHeader>
              <DialogTitle>{formatPaise(commission.agreed_amount_paise)}</DialogTitle>
              <DialogDescription>
                {commission.agent_name ?? "Unknown agent"} · {commission.agent_code}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <p className="rounded-lg bg-muted p-3 text-xs text-text-secondary">
                Recipient and amount come from this commission and cannot be changed here. Enter
                only where the money should go.
              </p>

              <PayoutDestinationFields
                idPrefix="commission-payout"
                form={form}
                errors={errors}
                onChange={set}
                disabled={busy}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={resetAndClose} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={() => void onSubmit()} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Pay commission
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
