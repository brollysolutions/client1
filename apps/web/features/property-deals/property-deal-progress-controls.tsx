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

  const options = nextStatusOptions(deal.status);
  // on_hold/rejected have no ORDER position; fall back to -1 (most restrictive),
  // matching the server's _effective_index gating for the terms fields.
  const effectiveIndex = ORDER_INDEX.get(deal.status) ?? -1;
  const termsEnabled = effectiveIndex >= BOOKED_INDEX;

  async function onStatusSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nextStatus) {
      toast.error("Choose a status");
      return;
    }
    if (SIDE_BRANCH.includes(nextStatus) && !reason.trim()) {
      toast.error("Add a reason", { description: "Required for rejected or on hold." });
      return;
    }
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
    setSavingTerms(true);
    const res = await onUpdate({
      price_quoted: priceQuoted.trim() || null,
      booking_amount: bookingAmount.trim() || null,
    });
    setSavingTerms(false);
    if (res.ok) {
      toast.success("Deal terms saved");
    } else {
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
          <Label>Move to</Label>
          <Select value={nextStatus} onValueChange={(v) => setNextStatus(v as PropertyDealStatus)}>
            <SelectTrigger className="w-48">
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
        </div>
        {nextStatus && SIDE_BRANCH.includes(nextStatus) ? (
          <div className="min-w-48 flex-1">
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={1}
              placeholder="Why?"
            />
          </div>
        ) : null}
        <Button type="submit" size="sm" disabled={savingStatus}>
          {savingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Update status
        </Button>
      </form>

      {termsEnabled ? (
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => void onTermsSubmit(e)}>
          <div>
            <Label>Price quoted (₹)</Label>
            <Input
              type="number"
              min={0}
              value={priceQuoted}
              onChange={(e) => setPriceQuoted(e.target.value)}
              placeholder="8000000"
            />
          </div>
          <div>
            <Label>Booking amount (₹)</Label>
            <Input
              type="number"
              min={0}
              value={bookingAmount}
              onChange={(e) => setBookingAmount(e.target.value)}
              placeholder="500000"
            />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={savingTerms}>
            {savingTerms ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save terms
          </Button>
        </form>
      ) : (
        <p className="text-xs text-text-secondary">
          Price and booking amount can be recorded once the deal is booked.
        </p>
      )}
    </div>
  );
}
