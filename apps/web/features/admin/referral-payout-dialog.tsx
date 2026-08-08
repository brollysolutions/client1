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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { AdminReferral, ReferralPayoutRequest } from "@/lib/admin-referrals-api";
import type { ApiResponse } from "@/lib/api/client";
import { formatPaise } from "@/lib/format";
import {
  buildReferralPayoutPayload,
  DESTINATION_OPTIONS,
  EMPTY_REFERRAL_PAYOUT_FORM,
  validateReferralPayoutForm,
  type ReferralPayoutFormState,
} from "@/lib/referral-payout-form";

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
  }

  async function onSubmit() {
    if (!referral) return;
    const errs = validateReferralPayoutForm(form);
    setErrors(errs);
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
      <DialogContent className="max-w-lg">
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

              <div className="space-y-1.5">
                <Label>Destination</Label>
                <RadioGroup
                  value={form.destinationType}
                  onValueChange={(v) =>
                    set("destinationType", v as ReferralPayoutFormState["destinationType"])
                  }
                  className="grid-cols-1 sm:grid-cols-3"
                >
                  {DESTINATION_OPTIONS.map((o) => (
                    <div key={o.value} className="flex items-center gap-2">
                      <RadioGroupItem value={o.value} id={`ref-dest-${o.value}`} />
                      <Label htmlFor={`ref-dest-${o.value}`} className="font-normal">
                        {o.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                {errors.destinationType ? (
                  <p className="text-xs text-destructive">{errors.destinationType}</p>
                ) : null}
              </div>

              {form.destinationType === "vpa" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="ref-payout-vpa">UPI VPA</Label>
                  <Input
                    id="ref-payout-vpa"
                    placeholder="name@bank"
                    value={form.vpa}
                    onChange={(e) => set("vpa", e.target.value)}
                  />
                  {errors.vpa ? <p className="text-xs text-destructive">{errors.vpa}</p> : null}
                </div>
              ) : form.destinationType === "bank_account" ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="ref-payout-ifsc">IFSC</Label>
                    <Input
                      id="ref-payout-ifsc"
                      value={form.ifsc}
                      onChange={(e) => set("ifsc", e.target.value)}
                    />
                    {errors.ifsc ? <p className="text-xs text-destructive">{errors.ifsc}</p> : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ref-payout-account">Account number</Label>
                    <Input
                      id="ref-payout-account"
                      value={form.accountNumber}
                      onChange={(e) => set("accountNumber", e.target.value)}
                    />
                    {errors.accountNumber ? (
                      <p className="text-xs text-destructive">{errors.accountNumber}</p>
                    ) : null}
                  </div>
                </div>
              ) : form.destinationType === "cheque" ? (
                <p className="rounded-lg bg-muted p-3 text-xs text-text-secondary">
                  The cheque reference is recorded only after approval and issuance.
                </p>
              ) : null}
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
