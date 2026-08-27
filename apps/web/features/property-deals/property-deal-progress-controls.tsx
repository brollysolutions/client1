"use client";

// Shared status/deal-terms progression controls for a property deal — used by
// both the Telecaller lead-detail view and the Admin property-deals view,
// against their own PATCH endpoint (telecaller-assigned-only vs admin
// platform-bypass; both call the same backend state machine). The ORDER/
// STATUS_LABEL/nextStatusOptions mirrors below are a UX hint only, so the form
// doesn't offer a doomed move — the server (services/property_deals.py) is the
// real validator.

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ApiResponse } from "@/lib/api/client";
import {
  apiIssuesToFieldErrors,
  focusFirstInvalidField,
  type FieldErrors,
} from "@/lib/form-validation";
import {
  validatePropertyDealTerms,
  type PropertyDealTermsField,
} from "@/features/telecaller/telecaller-lead-detail-validation";

export type PropertyDealStatus =
  | "new"
  | "contacted"
  | "site_visit_done"
  | "negotiation"
  | "booked"
  | "agreement_signed"
  | "closed"
  | "rejected"
  | "on_hold";

export interface PropertyDealLike {
  status: PropertyDealStatus;
  status_reason?: string | null;
  price_quoted?: string | null;
  booking_amount?: string | null;
}

export interface PropertyDealProgressPayload {
  status?: PropertyDealStatus;
  status_reason?: string | null;
  price_quoted?: string | null;
  booking_amount?: string | null;
}

const ORDER: PropertyDealStatus[] = [
  "new",
  "contacted",
  "site_visit_done",
  "negotiation",
  "booked",
  "agreement_signed",
  "closed",
];
const ORDER_INDEX = new Map(ORDER.map((s, i) => [s, i]));
const TERMINAL = new Set<PropertyDealStatus>(["closed", "rejected"]);
const SIDE_BRANCH: PropertyDealStatus[] = ["on_hold", "rejected"];
const BOOKED_INDEX = ORDER_INDEX.get("booked") ?? 4;

export const STATUS_LABEL: Record<PropertyDealStatus, string> = {
  new: "New",
  contacted: "Contacted",
  site_visit_done: "Site visit done",
  negotiation: "Negotiation",
  booked: "Booked",
  agreement_signed: "Agreement signed",
  closed: "Closed",
  rejected: "Rejected",
  on_hold: "On hold",
};

function nextStatusOptions(current: PropertyDealStatus): PropertyDealStatus[] {
  if (TERMINAL.has(current)) return [];
  if (current === "on_hold") return [...ORDER, "rejected"];
  const currentIndex = ORDER_INDEX.get(current) ?? -1;
  const forward = ORDER.filter((s) => (ORDER_INDEX.get(s) ?? -1) > currentIndex);
  return [...forward, ...SIDE_BRANCH];
}

export function PropertyDealProgressControls({
  deal,
  onUpdate,
}: {
  deal: PropertyDealLike;
  onUpdate: (payload: PropertyDealProgressPayload) => Promise<ApiResponse<unknown>>;
}) {
  const [nextStatus, setNextStatus] = React.useState<PropertyDealStatus | "">("");
  const [reason, setReason] = React.useState("");
  const [priceQuoted, setPriceQuoted] = React.useState(deal.price_quoted ?? "");
  const [bookingAmount, setBookingAmount] = React.useState(deal.booking_amount ?? "");
  const [savingStatus, setSavingStatus] = React.useState(false);
  const [savingTerms, setSavingTerms] = React.useState(false);
  const [statusError, setStatusError] = React.useState<string>();
  const [reasonError, setReasonError] = React.useState<string>();
  const [termErrors, setTermErrors] = React.useState<FieldErrors<PropertyDealTermsField>>({});
  const controlId = React.useId();
  const termsFormRef = React.useRef<HTMLFormElement>(null);

  const options = nextStatusOptions(deal.status);
  // on_hold/rejected have no ORDER position; fall back to -1 (most restrictive),
  // matching the server's _effective_index gating for the terms fields.
  const effectiveIndex = ORDER_INDEX.get(deal.status) ?? -1;
  const termsEnabled = effectiveIndex >= BOOKED_INDEX;

  async function onStatusSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nextStatus) {
      setStatusError("Choose a status.");
      return;
    }
    if (SIDE_BRANCH.includes(nextStatus) && !reason.trim()) {
      setReasonError("A reason is required for rejected or on hold.");
      return;
    }
    setStatusError(undefined);
    setReasonError(undefined);
    setSavingStatus(true);
    const res = await onUpdate({ status: nextStatus, status_reason: reason.trim() || null });
    setSavingStatus(false);
    if (res.ok) {
      toast.success("Deal status updated");
      setNextStatus("");
      setReason("");
    } else {
      toast.error("Couldn't update status", { description: (res as { error?: string }).error });
    }
  }

  async function onTermsSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors = validatePropertyDealTerms({ priceQuoted, bookingAmount });
    setTermErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      requestAnimationFrame(() => {
        if (termsFormRef.current) focusFirstInvalidField(termsFormRef.current);
      });
      return;
    }
    setSavingTerms(true);
    const res = await onUpdate({
      price_quoted: priceQuoted.trim() || null,
      booking_amount: bookingAmount.trim() || null,
    });
    setSavingTerms(false);
    if (res.ok) {
      toast.success("Deal terms saved");
      setTermErrors({});
    } else {
      const serverErrors = apiIssuesToFieldErrors(res.issues, {
        price_quoted: "priceQuoted",
        booking_amount: "bookingAmount",
      });
      if (Object.keys(serverErrors).length > 0) {
        setTermErrors(serverErrors);
        requestAnimationFrame(() => {
          if (termsFormRef.current) focusFirstInvalidField(termsFormRef.current);
        });
      }
      toast.error("Couldn't save terms", { description: (res as { error?: string }).error });
    }
  }

  if (TERMINAL.has(deal.status)) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{STATUS_LABEL[deal.status]}</Badge>
        {deal.status_reason ? (
          <span className="text-xs text-text-secondary">{deal.status_reason}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-4">
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => void onStatusSubmit(e)}>
        <div>
          <Label htmlFor={`${controlId}-status`}>Move to<RequiredIndicator /></Label>
          <Select value={nextStatus} onValueChange={(v) => { setNextStatus(v as PropertyDealStatus); setStatusError(undefined); setReasonError(undefined); }}>
            <SelectTrigger id={`${controlId}-status`} className="w-48" aria-required="true" aria-invalid={Boolean(statusError)} aria-describedby={statusError ? `${controlId}-status-error` : undefined}>
              <SelectValue placeholder="Choose next status" />
            </SelectTrigger>
            <SelectContent>
              {options.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id={`${controlId}-status-error`} className="mt-1">{statusError}</FieldError>
        </div>
        {nextStatus && SIDE_BRANCH.includes(nextStatus) ? (
          <div className="min-w-48 flex-1">
            <Label htmlFor={`${controlId}-reason`}>Reason<RequiredIndicator /></Label>
            <Textarea
              id={`${controlId}-reason`}
              value={reason}
              onChange={(e) => { setReason(e.target.value); setReasonError(undefined); }}
              rows={1}
              maxLength={1000}
              placeholder="Why?"
              aria-invalid={Boolean(reasonError)}
              aria-describedby={reasonError ? `${controlId}-reason-error` : undefined}
            />
            <FieldError id={`${controlId}-reason-error`} className="mt-1">{reasonError}</FieldError>
          </div>
        ) : null}
        <Button type="submit" size="sm" disabled={savingStatus}>
          {savingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Update status
        </Button>
      </form>

      {termsEnabled ? (
        <form
          ref={termsFormRef}
          className="flex flex-wrap items-start gap-3"
          noValidate
          onSubmit={(e) => void onTermsSubmit(e)}
        >
          <div>
            <Label htmlFor={`${controlId}-price-quoted`}>Price quoted (₹)</Label>
            <Input
              id={`${controlId}-price-quoted`}
              name="price_quoted"
              type="number"
              min="0.01"
              max="999999999999.99"
              step="0.01"
              value={priceQuoted}
              onChange={(e) => {
                setPriceQuoted(e.target.value);
                setTermErrors((current) => ({
                  ...current,
                  priceQuoted: undefined,
                  form: undefined,
                }));
              }}
              placeholder="8000000"
              aria-invalid={Boolean(termErrors.priceQuoted || termErrors.form)}
              aria-describedby={
                [
                  termErrors.priceQuoted ? `${controlId}-price-quoted-error` : undefined,
                  termErrors.form ? `${controlId}-terms-error` : undefined,
                ]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
            />
            <FieldError id={`${controlId}-price-quoted-error`}>
              {termErrors.priceQuoted}
            </FieldError>
          </div>
          <div>
            <Label htmlFor={`${controlId}-booking-amount`}>Booking amount (₹)</Label>
            <Input
              id={`${controlId}-booking-amount`}
              name="booking_amount"
              type="number"
              min="0.01"
              max="999999999999.99"
              step="0.01"
              value={bookingAmount}
              onChange={(e) => {
                setBookingAmount(e.target.value);
                setTermErrors((current) => ({
                  ...current,
                  bookingAmount: undefined,
                  form: undefined,
                }));
              }}
              placeholder="500000"
              aria-invalid={Boolean(termErrors.bookingAmount)}
              aria-describedby={
                termErrors.bookingAmount ? `${controlId}-booking-amount-error` : undefined
              }
            />
            <FieldError id={`${controlId}-booking-amount-error`}>
              {termErrors.bookingAmount}
            </FieldError>
          </div>
          <div className="pt-6">
            <Button type="submit" size="sm" variant="outline" disabled={savingTerms}>
              {savingTerms ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save terms
            </Button>
          </div>
          <FieldError id={`${controlId}-terms-error`} className="basis-full">
            {termErrors.form}
          </FieldError>
        </form>
      ) : (
        <p className="text-xs text-text-secondary">
          Price and booking amount can be recorded once the deal is booked.
        </p>
      )}
    </div>
  );
}
