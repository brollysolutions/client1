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
  buildFeeCashbackPayoutPayload,
  EMPTY_FEE_CASHBACK_PAYOUT_FORM,
  validateFeeCashbackPayoutForm,
  type FeeCashbackPayoutFormState,
} from "@/lib/fee-cashback-payout-form";
import type { FeeCashbackPayoutRequest, FeeCashbackRead } from "@/lib/admin-fee-cashbacks-api";
import { PayoutDestinationFields } from "./payout-destination-fields";

export function FeeCashbackPayoutDialog({
  cashback,
  onOpenChange,
  onPay,
}: {
  cashback: FeeCashbackRead | null;
  onOpenChange: (open: boolean) => void;
  onPay: (cashbackId: string, body: FeeCashbackPayoutRequest) => Promise<ApiResponse<unknown>>;
}) {
  const [form, setForm] = React.useState<FeeCashbackPayoutFormState>(
    EMPTY_FEE_CASHBACK_PAYOUT_FORM,
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);

  function resetAndClose() {
    setForm(EMPTY_FEE_CASHBACK_PAYOUT_FORM);
    setErrors({});
    onOpenChange(false);
  }

  function set<K extends keyof FeeCashbackPayoutFormState>(
    key: K,
    value: FeeCashbackPayoutFormState[K],
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
    if (!cashback) return;
    const errs = validateFeeCashbackPayoutForm(form);
    showErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const payload = buildFeeCashbackPayoutPayload(form);

    setBusy(true);
    const res = await onPay(cashback.id, payload);
    setBusy(false);

    if (res.ok) {
      toast.success("Payout raised", { description: "Awaiting a different admin's approval." });
      resetAndClose();
      return;
    }
    if (res.status === 409) {
      toast.warning("This cashback may already have a payout", {
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
    <Dialog open={cashback !== null} onOpenChange={(o) => (o ? undefined : resetAndClose())}>
      <DialogContent ref={contentRef} className="max-w-lg">
        {cashback !== null ? (
          <>
            <DialogHeader>
              <DialogTitle>{formatPaise(cashback.amount_paise)}</DialogTitle>
              <DialogDescription>{cashback.client_name ?? "Unknown client"}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <p className="rounded-lg bg-muted p-3 text-xs text-text-secondary">
                Recipient and amount come from this cashback and cannot be changed here. Enter
                only where the money should go.
              </p>

              <PayoutDestinationFields
                idPrefix="cashback-payout"
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
                Pay cashback
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
