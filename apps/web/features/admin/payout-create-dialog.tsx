"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
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
import type { ApiResponse } from "@/lib/api/client";
import { apiIssuesToFieldErrors, focusFirstInvalidField } from "@/lib/form-validation";
import { formatPaise } from "@/lib/format";
import type { Payout, PayoutCreate } from "@/lib/payouts-api";
import {
  BUSINESS_LINE_OPTIONS,
  buildPayoutPayload,
  EMPTY_PAYOUT_FORM,
  newIdempotencyKey,
  rupeesToPaise,
  TYPE_OPTIONS,
  validatePayoutForm,
  type PayoutDestinationFormState,
  type PayoutFormState,
} from "@/lib/payout-form";

import { PayoutDestinationFields } from "./payout-destination-fields";
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
  const contentRef = React.useRef<HTMLDivElement>(null);
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
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function setDestination<Key extends keyof PayoutDestinationFormState>(
    key: Key,
    value: PayoutDestinationFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
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
    const errs = validatePayoutForm(form);
    showErrors(errs);
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
    const serverErrors = apiIssuesToFieldErrors(res.issues, {
      recipient_user_uuid: "recipient",
      type: "type",
      business_line: "businessLine",
      amount_paise: "amountRupees",
      destination_type: "destinationType",
      "destination.vpa": "vpa",
      "destination.ifsc": "ifsc",
      "destination.account_number": "accountNumber",
    });
    if (Object.keys(serverErrors).length > 0) showErrors(serverErrors);
    toast.error("Could not raise the payout", { description: res.error });
  }

  const previewPaise = rupeesToPaise(form.amountRupees);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : resetAndClose())}>
      <DialogContent ref={contentRef} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Raise a payout</DialogTitle>
          <DialogDescription>
            Creates a payout awaiting approval from a different admin.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="payout-recipient">Recipient<RequiredIndicator /></Label>
            <RecipientPicker
              id="payout-recipient"
              value={form.recipient}
              onChange={(v) => set("recipient", v)}
              aria-invalid={Boolean(errors.recipient)}
              aria-describedby={errors.recipient ? "payout-recipient-error" : undefined}
            />
            <FieldError id="payout-recipient-error" className="text-xs">{errors.recipient}</FieldError>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="payout-type">Type<RequiredIndicator /></Label>
              <Select value={form.type} onValueChange={(v) => set("type", v as PayoutFormState["type"])}>
                <SelectTrigger id="payout-type" aria-required="true" aria-invalid={Boolean(errors.type)} aria-describedby={errors.type ? "payout-type-error" : undefined}>
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
              <FieldError id="payout-type-error" className="text-xs">{errors.type}</FieldError>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payout-business-line">Business line<RequiredIndicator /></Label>
              <Select
                value={form.businessLine || undefined}
                onValueChange={(v) =>
                  set("businessLine", v as PayoutFormState["businessLine"])
                }
              >
                <SelectTrigger id="payout-business-line" aria-required="true" aria-invalid={Boolean(errors.businessLine)} aria-describedby={errors.businessLine ? "payout-business-line-error" : undefined}>
                  <SelectValue placeholder="Choose a business line" />
                </SelectTrigger>
                <SelectContent>
                  {BUSINESS_LINE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError id="payout-business-line-error" className="text-xs">{errors.businessLine}</FieldError>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payout-amount">Amount (₹)</Label>
            <Input
              id="payout-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={form.amountRupees}
              aria-invalid={Boolean(errors.amountRupees)}
              aria-describedby={errors.amountRupees ? "payout-amount-error" : undefined}
              onChange={(e) => set("amountRupees", e.target.value)}
            />
            {previewPaise !== null ? (
              <p className="text-xs text-text-secondary">{formatPaise(previewPaise)}</p>
            ) : null}
            <FieldError id="payout-amount-error" className="text-xs">{errors.amountRupees}</FieldError>
          </div>

          <PayoutDestinationFields
            idPrefix="payout"
            form={form}
            errors={errors}
            onChange={setDestination}
            disabled={busy}
          />
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
