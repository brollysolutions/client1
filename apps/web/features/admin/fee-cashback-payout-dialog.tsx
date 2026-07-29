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
import type { ApiResponse } from "@/lib/api/client";
import { formatPaise } from "@/lib/format";
import {
  buildFeeCashbackPayoutPayload,
  DESTINATION_OPTIONS,
  EMPTY_FEE_CASHBACK_PAYOUT_FORM,
  validateFeeCashbackPayoutForm,
  type FeeCashbackPayoutFormState,
} from "@/lib/fee-cashback-payout-form";
import type { FeeCashbackPayoutRequest, FeeCashbackRead } from "@/lib/admin-fee-cashbacks-api";

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
  }

  async function onSubmit() {
    if (!cashback) return;
    const errs = validateFeeCashbackPayoutForm(form);
    setErrors(errs);
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
    toast.error("Could not raise the payout", { description: res.error });
  }

  return (
    <Dialog open={cashback !== null} onOpenChange={(o) => (o ? undefined : resetAndClose())}>
      <DialogContent className="max-w-lg">
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

              <div className="space-y-1.5">
                <Label>Destination</Label>
                <RadioGroup
                  value={form.destinationType}
                  onValueChange={(v) =>
                    set("destinationType", v as FeeCashbackPayoutFormState["destinationType"])
                  }
                  className="grid-flow-col"
                >
                  {DESTINATION_OPTIONS.map((o) => (
                    <div key={o.value} className="flex items-center gap-2">
                      <RadioGroupItem value={o.value} id={`fcb-dest-${o.value}`} />
                      <Label htmlFor={`fcb-dest-${o.value}`} className="font-normal">
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
                  <Label htmlFor="fcb-payout-vpa">UPI VPA</Label>
                  <Input
                    id="fcb-payout-vpa"
                    placeholder="name@bank"
                    value={form.vpa}
                    onChange={(e) => set("vpa", e.target.value)}
                  />
                  {errors.vpa ? <p className="text-xs text-destructive">{errors.vpa}</p> : null}
                </div>
              ) : form.destinationType === "bank_account" ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="fcb-payout-ifsc">IFSC</Label>
                    <Input
                      id="fcb-payout-ifsc"
                      value={form.ifsc}
                      onChange={(e) => set("ifsc", e.target.value)}
                    />
                    {errors.ifsc ? <p className="text-xs text-destructive">{errors.ifsc}</p> : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fcb-payout-account">Account number</Label>
                    <Input
                      id="fcb-payout-account"
                      value={form.accountNumber}
                      onChange={(e) => set("accountNumber", e.target.value)}
                    />
                    {errors.accountNumber ? (
                      <p className="text-xs text-destructive">{errors.accountNumber}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
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
