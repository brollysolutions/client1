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
  buildCommissionPayoutPayload,
  DESTINATION_OPTIONS,
  EMPTY_COMMISSION_PAYOUT_FORM,
  validateCommissionPayoutForm,
  type CommissionPayoutFormState,
} from "@/lib/commission-payout-form";
import type { CommissionPayoutRequest, CommissionRead } from "@/lib/admin-commissions-api";

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
  }

  async function onSubmit() {
    if (!commission) return;
    const errs = validateCommissionPayoutForm(form);
    setErrors(errs);
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
    toast.error("Could not raise the payout", { description: res.error });
  }

  return (
    <Dialog
      open={commission !== null}
      onOpenChange={(o) => (o ? undefined : resetAndClose())}
    >
      <DialogContent className="max-w-lg">
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

              <div className="space-y-1.5">
                <Label>Destination</Label>
                <RadioGroup
                  value={form.destinationType}
                  onValueChange={(v) =>
                    set("destinationType", v as CommissionPayoutFormState["destinationType"])
                  }
                  className="grid-flow-col"
                >
                  {DESTINATION_OPTIONS.map((o) => (
                    <div key={o.value} className="flex items-center gap-2">
                      <RadioGroupItem value={o.value} id={`com-dest-${o.value}`} />
                      <Label htmlFor={`com-dest-${o.value}`} className="font-normal">
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
                  <Label htmlFor="com-payout-vpa">UPI VPA</Label>
                  <Input
                    id="com-payout-vpa"
                    placeholder="name@bank"
                    value={form.vpa}
                    onChange={(e) => set("vpa", e.target.value)}
                  />
                  {errors.vpa ? <p className="text-xs text-destructive">{errors.vpa}</p> : null}
                </div>
              ) : form.destinationType === "bank_account" ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="com-payout-ifsc">IFSC</Label>
                    <Input
                      id="com-payout-ifsc"
                      value={form.ifsc}
                      onChange={(e) => set("ifsc", e.target.value)}
                    />
                    {errors.ifsc ? <p className="text-xs text-destructive">{errors.ifsc}</p> : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="com-payout-account">Account number</Label>
                    <Input
                      id="com-payout-account"
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
                Pay commission
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
