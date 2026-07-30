"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { createOffer } from "@/lib/offers-api";

const LINE_OPTIONS = [
  { value: "loans", label: "Loans" },
  { value: "real_estate", label: "Real Estate" },
  { value: "both", label: "Both lines" },
] as const;

const DISCOUNT_TYPE_OPTIONS = [
  { value: "percentage", label: "Percentage" },
  { value: "flat", label: "Flat amount" },
  { value: "cashback-tie", label: "Cashback tie-in" },
] as const;

export function OfferForm() {
  const router = useRouter();
  const [businessLine, setBusinessLine] = React.useState<(typeof LINE_OPTIONS)[number]["value"]>(
    "loans",
  );
  const [discountType, setDiscountType] =
    React.useState<(typeof DISCOUNT_TYPE_OPTIONS)[number]["value"]>("percentage");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [discountValue, setDiscountValue] = React.useState("");
  const [code, setCode] = React.useState("");
  const [startsAt, setStartsAt] = React.useState("");
  const [endsAt, setEndsAt] = React.useState("");
  const [titleError, setTitleError] = React.useState<string | undefined>();
  const [discountError, setDiscountError] = React.useState<string | undefined>();
  const [scheduleError, setScheduleError] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    let hasError = false;
    if (title.trim().length === 0) {
      setTitleError("Title is required.");
      hasError = true;
    } else {
      setTitleError(undefined);
    }
    const value = Number(discountValue);
    if (!discountValue || Number.isNaN(value) || value < 0) {
      setDiscountError("Enter a valid discount value.");
      hasError = true;
    } else if (discountType === "percentage" && value > 100) {
      setDiscountError("A percentage offer can't exceed 100.");
      hasError = true;
    } else {
      setDiscountError(undefined);
    }
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      setScheduleError("End must be after start.");
      hasError = true;
    } else {
      setScheduleError(undefined);
    }
    if (hasError) return;

    setSubmitting(true);
    const res = await createOffer({
      business_line: businessLine,
      title: title.trim(),
      description: description.trim() || null,
      discount_type: discountType,
      discount_value: String(value),
      code: code.trim() || null,
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    });
    setSubmitting(false);
    if (res.ok) {
      toast.success("Offer draft created", {
        description: "Schedule it whenever you're ready to go live.",
      });
      router.push("/dashboard/offers");
    } else {
      toast.error("Could not create offer", { description: res.error });
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">New offer</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Saved as a draft first. Schedule it, then activate it when the discount should go live.
        </p>
      </div>

      <form className="space-y-6" onSubmit={onSubmit}>
        <div>
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={500}
          />
          {titleError ? <p className="mt-1 text-sm text-destructive">{titleError}</p> : null}
        </div>

        <div>
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="business-line">Line</Label>
            <Select
              value={businessLine}
              onValueChange={(v) => setBusinessLine(v as typeof businessLine)}
            >
              <SelectTrigger id="business-line">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LINE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="discount-type">Discount type</Label>
            <Select
              value={discountType}
              onValueChange={(v) => setDiscountType(v as typeof discountType)}
            >
              <SelectTrigger id="discount-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISCOUNT_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="discount-value">
              {discountType === "percentage" ? "Discount (%)" : "Discount (₹)"}
            </Label>
            <Input
              id="discount-value"
              inputMode="decimal"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value.replace(/[^0-9.]/g, ""))}
            />
            {discountError ? (
              <p className="mt-1 text-sm text-destructive">{discountError}</p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="code">Promo code</Label>
            <Input
              id="code"
              placeholder="Optional"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={100}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="starts-at">Goes live at</Label>
            <Input
              id="starts-at"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ends-at">Expires at</Label>
            <Input
              id="ends-at"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </div>
        </div>
        {scheduleError ? <p className="-mt-3 text-sm text-destructive">{scheduleError}</p> : null}

        <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save draft
        </Button>
      </form>
    </div>
  );
}
