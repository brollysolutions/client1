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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPaise } from "@/lib/format";
import type { ApiResponse } from "@/lib/api/client";
import type { Payout, PayoutCreate } from "@/lib/payouts-api";
import {
  BUSINESS_LINE_OPTIONS,
  buildPayoutPayload,
  DESTINATION_OPTIONS,
  EMPTY_PAYOUT_FORM,
  newIdempotencyKey,
  rupeesToPaise,
  TYPE_OPTIONS,
  validatePayoutForm,
  type PayoutFormState,
} from "@/lib/payout-form";

import { RecipientPicker } from "./recipient-picker";

export function PayoutCreateDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (body: PayoutCreate) => Promise<ApiResponse<Payout>>;
}) {
  const [form, setForm] = React.useState<PayoutFormState>(EMPTY_PAYOUT_FORM);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  // Lazily generated on first submit and kept across every failed retry of the
  // SAME submission, so a retry after a timeout/409 dedupes server-side rather
  // than creating a second payout. Cleared only on success or a fresh form.
  const idempotencyKeyRef = React.useRef<string | null>(null);

  function resetAndClose() {
    setForm(EMPTY_PAYOUT_FORM);
    setErrors({});
    idempotencyKeyRef.current = null;
    onOpenChange(false);
  }

  function set<K extends keyof PayoutFormState>(key: K, value: PayoutFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit() {
    const errs = validatePayoutForm(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    if (idempotencyKeyRef.current === null) {
      idempotencyKeyRef.current = newIdempotencyKey();
    }
    const payload = buildPayoutPayload(form, idempotencyKeyRef.current);

    setBusy(true);
    const res = await onCreate(payload);
    setBusy(false);

    if (res.ok) {
      toast.success("Payout raised", { description: "Awaiting a different admin's approval." });
      resetAndClose();
      return;
    }
    if (res.status === 409) {
      toast.warning("This payout may already exist", {
        description: "Close this and check the list before trying again.",
      });
      return;
    }
    toast.error("Could not raise the payout", { description: res.error });
  }

  const previewPaise = rupeesToPaise(form.amountRupees);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : resetAndClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Raise a payout</DialogTitle>
          <DialogDescription>
            Creates a payout awaiting approval from a different admin.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Recipient</Label>
            <RecipientPicker value={form.recipient} onChange={(v) => set("recipient", v)} />
            {errors.recipient ? <p className="text-xs text-destructive">{errors.recipient}</p> : null}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => set("type", v as PayoutFormState["type"])}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a type" />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.type ? <p className="text-xs text-destructive">{errors.type}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label>Business line</Label>
              <Select
                value={form.businessLine || "none"}
                onValueChange={(v) =>
                  set("businessLine", (v === "none" ? "" : v) as PayoutFormState["businessLine"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUSINESS_LINE_OPTIONS.map((o) => (
                    <SelectItem key={o.value || "none"} value={o.value || "none"}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payout-amount">Amount (₹)</Label>
            <Input
              id="payout-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={form.amountRupees}
              onChange={(e) => set("amountRupees", e.target.value)}
            />
            {previewPaise !== null ? (
              <p className="text-xs text-text-secondary">{formatPaise(previewPaise)}</p>
            ) : null}
            {errors.amountRupees ? (
              <p className="text-xs text-destructive">{errors.amountRupees}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Destination</Label>
            <RadioGroup
              value={form.destinationType}
              onValueChange={(v) => set("destinationType", v as PayoutFormState["destinationType"])}
              className="grid-cols-1 sm:grid-cols-3"
            >
              {DESTINATION_OPTIONS.map((o) => (
                <div key={o.value} className="flex items-center gap-2">
                  <RadioGroupItem value={o.value} id={`dest-${o.value}`} />
                  <Label htmlFor={`dest-${o.value}`} className="font-normal">
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
              <Label htmlFor="payout-vpa">UPI VPA</Label>
              <Input
                id="payout-vpa"
                placeholder="name@bank"
                value={form.vpa}
                onChange={(e) => set("vpa", e.target.value)}
              />
              {errors.vpa ? <p className="text-xs text-destructive">{errors.vpa}</p> : null}
            </div>
          ) : form.destinationType === "bank_account" ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="payout-ifsc">IFSC</Label>
                <Input
                  id="payout-ifsc"
                  value={form.ifsc}
                  onChange={(e) => set("ifsc", e.target.value)}
                />
                {errors.ifsc ? <p className="text-xs text-destructive">{errors.ifsc}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payout-account">Account number</Label>
                <Input
                  id="payout-account"
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
              No bank details are stored. Record the cheque reference after a different Admin
              approves this payout and the cheque is issued.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Raise payout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
