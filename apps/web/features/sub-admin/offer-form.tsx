"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import {
  DashboardFormPage,
  DashboardFormSection,
} from "@/features/dashboard/dashboard-ui";
import { createOffer } from "@/lib/offers-api";
import { apiIssuesToFieldErrors, focusFirstInvalidField, integerError } from "@/lib/form-validation";

import { AudienceRuleFields, emptyAudienceRules } from "./audience-rule-fields";
import { OfferPreview } from "./cms-previews";
import { CmsPreviewFrame, type PreviewDevice } from "./cms-workspace";

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

export function OfferForm({ embedded = false, onCreated, onDirtyChange }: { embedded?: boolean; onCreated?: () => void; onDirtyChange?: (dirty: boolean) => void } = {}) {
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
  const [priorityError, setPriorityError] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);
  const [previewContext, setPreviewContext] = React.useState("public");
  const [previewDevice, setPreviewDevice] = React.useState<PreviewDevice>("desktop");
  const formRef = React.useRef<HTMLFormElement>(null);
  const dirty = Boolean(title || description || discountValue || code || startsAt || endsAt || priority !== "0" || businessLine !== "loans" || discountType !== "percentage");
  React.useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

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
    const nextPriorityError = integerError(priority, "Priority", {
      required: true,
      min: 0,
      max: 2_147_483_647,
    });
    setPriorityError(nextPriorityError);
    if (nextPriorityError) hasError = true;
    if (hasError) {
      requestAnimationFrame(() => {
        if (formRef.current) focusFirstInvalidField(formRef.current);
      });
      return;
    }

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
      if (onCreated) onCreated();
      else router.push("/dashboard/offers");
    } else {
      const serverErrors = apiIssuesToFieldErrors(res.issues, {
        title: "title",
        discount_value: "discountValue",
        priority: "priority",
        starts_at: "startsAt",
        ends_at: "endsAt",
      });
      if (serverErrors.title) setTitleError(serverErrors.title);
      if (serverErrors.discountValue) setDiscountError(serverErrors.discountValue);
      if (serverErrors.priority) setPriorityError(serverErrors.priority);
      if (serverErrors.startsAt || serverErrors.endsAt) {
        setScheduleError(serverErrors.endsAt ?? serverErrors.startsAt);
      }
      toast.error("Could not create offer", { description: res.error });
    }
  }

  return (
    <DashboardFormPage
      title="New offer"
      description="Configure the discount, eligible audience, priority, and active schedule."
      backHref="/dashboard/offers"
      backLabel="Back to offers"
      formTitle="Offer configuration"
      formDescription="The offer is saved as a draft before scheduling and activation."
      embedded={embedded}
      aside={
        <CmsPreviewFrame
          title="Offer preview"
          description="Compare the public line-page and authenticated dashboard cards while drafting."
          contexts={[{ value: "public", label: "Public page" }, { value: "dashboard", label: "Dashboard" }]}
          context={previewContext}
          onContextChange={setPreviewContext}
          device={previewDevice}
          onDeviceChange={setPreviewDevice}
        >
          <OfferPreview context={previewContext as "public" | "dashboard"} offer={{ title, description: description || null, discount_type: discountType, discount_value: discountValue || "0", code: code || null }} />
        </CmsPreviewFrame>
      }
    >
      <form ref={formRef} className="space-y-6" onSubmit={(event) => void onSubmit(event)} noValidate>
        <DashboardFormSection
          title="Offer details"
          description="Name the promotion and define its commercial value."
        >
          <div>
            <Label htmlFor="title">Title<RequiredIndicator /></Label>
            <Input
              id="title"
              value={title}
              onChange={(event) => { setTitle(event.target.value); setTitleError(undefined); }}
              maxLength={500}
              aria-invalid={Boolean(titleError)}
              aria-describedby={titleError ? "offer-title-error" : undefined}
            />
            <FieldError id="offer-title-error" className="mt-1">{titleError}</FieldError>
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
                onChange={(event) => { setDiscountValue(event.target.value.replace(/[^0-9.]/g, "")); setDiscountError(undefined); }}
                aria-invalid={Boolean(discountError)}
                aria-describedby={discountError ? "discount-value-error" : undefined}
              />
              <FieldError id="discount-value-error" className="mt-1">{discountError}</FieldError>
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
                onChange={(event) => { setPriority(event.target.value.replace(/\D/g, "")); setPriorityError(undefined); }}
                aria-invalid={Boolean(priorityError)}
                aria-describedby={["priority-help", priorityError ? "priority-error" : undefined].filter(Boolean).join(" ")}
              />
              <p id="priority-help" className="mt-1 text-xs text-text-secondary">Higher appears first.</p>
              <FieldError id="priority-error" className="mt-1">{priorityError}</FieldError>
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
                onChange={(event) => { setStartsAt(event.target.value); setScheduleError(undefined); }}
                aria-invalid={Boolean(scheduleError)}
                aria-describedby={scheduleError ? "offer-schedule-error" : undefined}
              />
            </div>
            <div>
              <Label htmlFor="ends-at">Expires at</Label>
              <Input
                id="ends-at"
                type="datetime-local"
                value={endsAt}
                onChange={(event) => { setEndsAt(event.target.value); setScheduleError(undefined); }}
                aria-invalid={Boolean(scheduleError)}
                aria-describedby={scheduleError ? "offer-schedule-error" : undefined}
              />
            </div>
          </div>
          <FieldError id="offer-schedule-error">{scheduleError}</FieldError>
        </DashboardFormSection>

        <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {submitting ? "Saving draft…" : "Save draft"}
        </Button>
      </form>
    </DashboardFormPage>
  );
}
