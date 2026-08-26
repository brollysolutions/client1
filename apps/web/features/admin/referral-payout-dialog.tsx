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
import type { AdminReferral, ReferralPayoutRequest } from "@/lib/admin-referrals-api";
import type { ApiResponse } from "@/lib/api/client";
import { apiIssuesToFieldErrors, focusFirstInvalidField } from "@/lib/form-validation";
import { formatPaise } from "@/lib/format";
import {
  buildReferralPayoutPayload,
  EMPTY_REFERRAL_PAYOUT_FORM,
  validateReferralPayoutForm,
  type ReferralPayoutFormState,
} from "@/lib/referral-payout-form";
import { PayoutDestinationFields } from "./payout-destination-fields";

export function ReferralPayoutDialog({
  referral,
  onOpenChange,
  onPay,
}: {
  referral: AdminReferral | null;
  onOpenChange: (open: boolean) => void;
  onPay: (
    referralId: string,
    body: ReferralPayoutRequest,
  ) => Promise<ApiResponse<unknown>>;
}) {
  const [form, setForm] = React.useState<ReferralPayoutFormState>(EMPTY_REFERRAL_PAYOUT_FORM);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);

  function resetAndClose() {
    setForm(EMPTY_REFERRAL_PAYOUT_FORM);
    setErrors({});
    onOpenChange(false);
  }

  function set<K extends keyof ReferralPayoutFormState>(
    key: K,
    value: ReferralPayoutFormState[K],
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
    if (!referral) return;
    const errs = validateReferralPayoutForm(form);
    showErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const payload = buildReferralPayoutPayload(form);

    setBusy(true);
    const res = await onPay(referral.id, payload);
    setBusy(false);

    if (res.ok) {
      toast.success("Payout raised", { description: "Awaiting a different admin's approval." });
      resetAndClose();
      return;
    }
    if (res.status === 409) {
      toast.warning("This referral may already have a payout", {
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

  // An "accrued" row always carries an amount (the router 409s creating a
  // payout otherwise), so this is unreachable in practice — but a money
  // confirmation dialog should refuse to open on a bad amount, never fall
  // back to rendering "₹0".
  const amountPaise = referral?.bonus_amount_paise ?? null;

  return (
    <Dialog
      open={referral !== null && amountPaise !== null}
      onOpenChange={(o) => (o ? undefined : resetAndClose())}
    >
      <DialogContent ref={contentRef} className="max-w-lg">
        {referral !== null && amountPaise !== null ? (
          <>
            <DialogHeader>
              <DialogTitle>{formatPaise(amountPaise)}</DialogTitle>
              <DialogDescription>
                {referral.referrer_name ?? "Unknown referrer"}
                {referral.referrer_code ? ` · ${referral.referrer_code}` : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <p className="rounded-lg bg-muted p-3 text-xs text-text-secondary">
                Recipient and amount come from this referral and cannot be changed here. Enter
                only where the money should go.
              </p>

              <PayoutDestinationFields
                idPrefix="referral-payout"
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
                Pay bonus
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
