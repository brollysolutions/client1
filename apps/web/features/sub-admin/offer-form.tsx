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
import {
  DashboardFormPage,
  DashboardFormSection,
} from "@/features/dashboard/dashboard-ui";
import { createOffer } from "@/lib/offers-api";

import { AudienceRuleFields, emptyAudienceRules } from "./audience-rule-fields";

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
  const [businessLine, setBusinessLine] = React.useState<
    (typeof LINE_OPTIONS)[number]["value"]
  >("loans");
  const [discountType, setDiscountType] = React.useState<
    (typeof DISCOUNT_TYPE_OPTIONS)[number]["value"]
  >("percentage");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [discountValue, setDiscountValue] = React.useState("");
  const [code, setCode] = React.useState("");
  const [startsAt, setStartsAt] = React.useState("");
  const [endsAt, setEndsAt] = React.useState("");
  const [priority, setPriority] = React.useState("0");
  const [audienceRules, setAudienceRules] = React.useState(emptyAudienceRules);
  const [titleError, setTitleError] = React.useState<string | undefined>();
  const [discountError, setDiscountError] = React.useState<string | undefined>();
  const [scheduleError, setScheduleError] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
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
      audience_rules: audienceRules,
      priority: Number(priority) || 0,
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
    <DashboardFormPage
      eyebrow="Promotions"
      title="New offer"
      description="Configure the discount, eligible audience, priority, and active schedule."
      backHref="/dashboard/offers"
      backLabel="Back to offers"
      formTitle="Offer configuration"
      formDescription="The offer is saved as a draft before scheduling and activation."
    >
      <form className="space-y-6" onSubmit={(event) => void onSubmit(event)}>
        <DashboardFormSection
          title="Offer details"
          description="Name the promotion and define its commercial value."
        >
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={500}
            />
            {titleError ? <p className="mt-1 text-sm text-destructive">{titleError}</p> : null}
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="business-line">Line</Label>
              <Select
                value={businessLine}
                onValueChange={(value) => setBusinessLine(value as typeof businessLine)}
              >
                <SelectTrigger id="business-line">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LINE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="discount-type">Discount type</Label>
              <Select
                value={discountType}
                onValueChange={(value) => setDiscountType(value as typeof discountType)}
              >
                <SelectTrigger id="discount-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISCOUNT_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="discount-value">
                {discountType === "percentage" ? "Discount (%)" : "Discount (₹)"}
              </Label>
              <Input
                id="discount-value"
                inputMode="decimal"
                value={discountValue}
                onChange={(event) =>
                  setDiscountValue(event.target.value.replace(/[^0-9.]/g, ""))
                }
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
                onChange={(event) => setCode(event.target.value)}
                maxLength={100}
              />
            </div>
            <div>
              <Label htmlFor="priority">Priority</Label>
              <Input
                id="priority"
                inputMode="numeric"
                value={priority}
                onChange={(event) => setPriority(event.target.value.replace(/\D/g, ""))}
              />
              <p className="mt-1 text-xs text-text-secondary">Higher appears first.</p>
            </div>
          </div>
        </DashboardFormSection>

        <DashboardFormSection
          title="Audience"
          description="Leave user type empty for all Clients, or narrow the offer with workflow and location signals."
        >
          <AudienceRuleFields
            value={audienceRules}
            onChange={setAudienceRules}
            disabled={submitting}
            allowedUserTypes={["client"]}
          />
        </DashboardFormSection>

        <DashboardFormSection
          title="Schedule"
          description="Choose the live window now or leave it open for later scheduling."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="starts-at">Goes live at</Label>
              <Input
                id="starts-at"
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ends-at">Expires at</Label>
              <Input
                id="ends-at"
                type="datetime-local"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
              />
            </div>
          </div>
          {scheduleError ? <p className="text-sm text-destructive">{scheduleError}</p> : null}
        </DashboardFormSection>

        <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {submitting ? "Saving draft…" : "Save draft"}
        </Button>
      </form>
    </DashboardFormPage>
  );
}
