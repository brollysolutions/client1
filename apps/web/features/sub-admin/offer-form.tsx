"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { components } from "@contracts/generated/schema";

import { Button } from "@/components/ui/button";
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DashboardFormPage, DashboardFormSection } from "@/features/dashboard/dashboard-ui";
import { focusFirstInvalidField, httpsUrlError, integerError } from "@/lib/form-validation";
import {
  createOffer,
  updateOffer,
  type Offer,
} from "@/lib/offers-api";

import { AudienceRuleFields, emptyAudienceRules, type AudienceRules } from "./audience-rule-fields";
import { OFFER_USAGE_TYPES } from "@/lib/campaign-artwork";

import { CampaignMediaPicker } from "./campaign-media-picker";
import { OfferPreview } from "./cms-previews";
import { CampaignPreviewPanel } from "./campaign-preview-panel";

type Schemas = components["schemas"];
type DiscountType = "percentage" | "flat" | "cashback-tie";
const LINE_OPTIONS = [
  { value: "loans", label: "Loans" },
  { value: "real_estate", label: "Real Estate" },
  { value: "both", label: "Both lines" },
] as const;
const DISCOUNT_TYPE_OPTIONS = [
  { value: "percentage", label: "Percentage" },
  { value: "flat", label: "Flat amount" },
  { value: "cashback-tie", label: "Cashback" },
] as const;

function dateTimeLocalValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function OfferForm({
  embedded = false,
  initialOffer,
  onCreated,
  onSaved,
  onDirtyChange,
}: {
  embedded?: boolean;
  initialOffer?: Offer;
  onCreated?: () => void;
  onSaved?: (offer: Offer) => void;
  onDirtyChange?: (dirty: boolean) => void;
} = {}) {
  const router = useRouter();
  const editing = Boolean(initialOffer);
  const [businessLine, setBusinessLine] = React.useState<"loans" | "real_estate" | "both">(
    () => (initialOffer?.business_line as "loans" | "real_estate" | "both") ?? "loans",
  );
  const [discountType, setDiscountType] = React.useState<DiscountType>(
    () => (initialOffer?.discount_type as DiscountType) ?? "percentage",
  );
  const [title, setTitle] = React.useState(() => initialOffer?.title ?? "");
  const [description, setDescription] = React.useState(() => initialOffer?.description ?? "");
  const [partnerName, setPartnerName] = React.useState(() => initialOffer?.partner_name ?? "");
  const [redemptionUrl, setRedemptionUrl] = React.useState(
    () => initialOffer?.redemption_url ?? "",
  );
  const [termsSummary, setTermsSummary] = React.useState(
    () => initialOffer?.terms_summary ?? "",
  );
  const [termsUrl, setTermsUrl] = React.useState(() => initialOffer?.terms_url ?? "");
  const [discountValue, setDiscountValue] = React.useState(
    () => initialOffer?.discount_value ?? "",
  );
  const [code, setCode] = React.useState(() => initialOffer?.code ?? "");
  const [mediaAssetId, setMediaAssetId] = React.useState(() => initialOffer?.media_asset_id ?? "");
  const [startsAt, setStartsAt] = React.useState(() => dateTimeLocalValue(initialOffer?.starts_at));
  const [endsAt, setEndsAt] = React.useState(() => dateTimeLocalValue(initialOffer?.ends_at));
  const [priority, setPriority] = React.useState(() => String(initialOffer?.priority ?? 0));
  const [audienceRules, setAudienceRules] = React.useState<AudienceRules>(() =>
    initialOffer?.audience_rules ?? {
      ...emptyAudienceRules(),
      user_types: ["client" as const],
    },
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(() => initialOffer?.image_url ?? null);
  const formRef = React.useRef<HTMLFormElement>(null);

  const dirty = editing
    ? Boolean(
        mediaAssetId !== (initialOffer?.media_asset_id ?? "") ||
          title !== initialOffer?.title ||
          description !== (initialOffer?.description ?? "") ||
          partnerName !== (initialOffer?.partner_name ?? "") ||
          redemptionUrl !== (initialOffer?.redemption_url ?? "") ||
          termsSummary !== (initialOffer?.terms_summary ?? "") ||
          termsUrl !== (initialOffer?.terms_url ?? "") ||
          discountValue !== initialOffer?.discount_value ||
          code !== (initialOffer?.code ?? "") ||
          startsAt !== dateTimeLocalValue(initialOffer?.starts_at) ||
          endsAt !== dateTimeLocalValue(initialOffer?.ends_at) ||
          priority !== String(initialOffer?.priority ?? 0) ||
          discountType !== initialOffer?.discount_type ||
          JSON.stringify(audienceRules) !== JSON.stringify(initialOffer?.audience_rules),
      )
    : Boolean(
        title ||
          description ||
          partnerName ||
          redemptionUrl ||
          termsSummary ||
          termsUrl ||
          discountValue ||
          code ||
          mediaAssetId ||
          startsAt ||
          endsAt ||
          priority !== "0" ||
          businessLine !== "loans" ||
          discountType !== "percentage",
      );
  React.useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Title is required.";
    if (!partnerName.trim()) next.partnerName = "Partner name is required.";
    if (!code.trim()) next.code = "Coupon code is required.";
    if (!termsSummary.trim()) next.termsSummary = "A short terms summary is required.";
    if (!mediaAssetId && !initialOffer?.image_key) next.image = "Choose artwork from the Media Library.";
    if (!audienceRules.user_types?.length) next.audience = "Choose at least one dashboard role.";
    const redemptionError = httpsUrlError(redemptionUrl, "Partner destination", true);
    if (redemptionError) next.redemptionUrl = redemptionError;
    const termsUrlValidation = httpsUrlError(termsUrl, "Full terms URL");
    if (termsUrlValidation) next.termsUrl = termsUrlValidation;
    const value = Number(discountValue);
    if (!discountValue || Number.isNaN(value) || value < 0) next.discount = "Enter a valid discount value.";
    else if (discountType === "percentage" && value > 100) next.discount = "A percentage offer cannot exceed 100.";
    const priorityValidation = integerError(priority, "Priority", { required: true, min: 0, max: 2_147_483_647 });
    if (priorityValidation) next.priority = priorityValidation;
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) next.schedule = "End must be after start.";
    setErrors(next);
    if (Object.keys(next).length) {
      requestAnimationFrame(() => formRef.current && focusFirstInvalidField(formRef.current));
      return;
    }

    setSubmitting(true);
    const values = {
      ...(initialOffer ? { expected_version: initialOffer.version } : {}),
      title: title.trim(),
      description: description.trim() || null,
      partner_name: partnerName.trim(),
      redemption_url: redemptionUrl.trim(),
      terms_summary: termsSummary.trim(),
      terms_url: termsUrl.trim() || null,
      image_key: initialOffer?.image_key ?? null,
      ...(mediaAssetId ? { media_asset_id: mediaAssetId } : {}),
      discount_type: discountType,
      discount_value: String(value),
      code: code.trim().toUpperCase(),
      audience_rules: audienceRules,
      priority: Number(priority),
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    } satisfies Schemas["OfferUpdate"];
    const result = initialOffer
      ? await updateOffer(initialOffer.id, values)
      : await createOffer({ ...values, business_line: businessLine });
    setSubmitting(false);
    if (!result.ok) {
      return void toast.error(editing ? "Could not update offer" : "Could not create offer", {
        description: result.error,
      });
    }
    toast.success(editing ? "Offer updated" : "Offer draft created", {
      description: "Review it, then submit it for Admin approval.",
    });
    if (editing) onSaved?.(result.data);
    else if (onCreated) onCreated();
    else router.push("/dashboard/campaigns?type=offers");
  }

  return (
    <DashboardFormPage
      title={editing ? "Edit dashboard offer" : "New dashboard offer"}
      description={
        editing
          ? "Correct every requested detail before resubmitting this campaign."
          : "Build a partner coupon campaign for selected Dhanadhara roles."
      }
      backHref="/dashboard/campaigns?type=offers"
      backLabel="Back to offers"
      formTitle="Campaign configuration"
      formDescription={
        editing
          ? "Draft and rejected campaigns remain private while you revise them."
          : "Drafts remain private until Admin review and activation."
      }
      embedded={embedded}
      wide
    >
      <form ref={formRef} className="space-y-6" onSubmit={(event) => void onSubmit(event)} noValidate>
        {/* Full width above the fields, matching the banner wizard: a 20rem
            aside could not show the signed-in dashboard at a useful size. */}
        <CampaignPreviewPanel
          caption="Signed-in dashboard — the only surface a coupon appears on"
        >
          <OfferPreview
            offer={{
              title,
              description: description || null,
              discount_type: discountType,
              discount_value: discountValue || "0",
              code: code || null,
              partner_name: partnerName || null,
              image_url: previewUrl,
              redemption_url: redemptionUrl || null,
              terms_summary: termsSummary || null,
            }}
          />
        </CampaignPreviewPanel>
        {initialOffer?.review_note ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <strong>Reviewer note:</strong> {initialOffer.review_note}
          </p>
        ) : null}
        <DashboardFormSection title="Partner coupon" description="Tell users who provides the benefit and where the code is redeemed.">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="offer-title" label="Campaign title" value={title} onChange={setTitle} required error={errors.title} maxLength={500} />
            <TextField id="offer-partner" label="Partner name" value={partnerName} onChange={setPartnerName} required error={errors.partnerName} maxLength={200} />
          </div>
          <div><Label htmlFor="offer-description">Description</Label><Textarea id="offer-description" name="description" value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="offer-code" label="Coupon code" value={code} onChange={setCode} required error={errors.code} maxLength={100} />
            <TextField id="offer-redemption" label="Partner destination" value={redemptionUrl} onChange={setRedemptionUrl} required error={errors.redemptionUrl} placeholder="https://partner.example/checkout" maxLength={1000} />
          </div>
          <p className="rounded-lg border border-border bg-surface p-3 text-xs text-text-secondary">Users copy the code, open the partner destination, and enter it during checkout before payment. Dhanadhara does not apply or track redemption without a partner integration.</p>
        </DashboardFormSection>

        <DashboardFormSection title="Benefit and artwork" description="Use clear, text-light artwork that remains readable on small dashboard cards.">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="min-w-0"><Label htmlFor="offer-line">Business line</Label><Select name="business_line" value={businessLine} disabled={editing} onValueChange={(value) => setBusinessLine(value as typeof businessLine)}><SelectTrigger id="offer-line" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{LINE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="min-w-0"><Label htmlFor="offer-discount-type">Discount type</Label><Select name="discount_type" value={discountType} onValueChange={(value) => setDiscountType(value as typeof discountType)}><SelectTrigger id="offer-discount-type" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{DISCOUNT_TYPE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="min-w-0"><Label htmlFor="offer-discount-value">Discount value <RequiredIndicator /></Label><Input id="offer-discount-value" name="discount_value" inputMode="decimal" value={discountValue} onChange={(event) => setDiscountValue(event.target.value.replace(/[^0-9.]/g, ""))} aria-invalid={Boolean(errors.discount)} aria-describedby={errors.discount ? "offer-discount-error" : undefined} /><FieldError id="offer-discount-error">{errors.discount}</FieldError></div>
          </div>
          <CampaignMediaPicker usageTypes={OFFER_USAGE_TYPES} businessLine={businessLine} invalid={Boolean(errors.image)} describedBy={errors.image ? "offer-artwork-error" : undefined} value={mediaAssetId} onChange={(id, asset) => { setMediaAssetId(id); setPreviewUrl(asset?.image_url ?? null); setErrors((current) => ({ ...current, image: "" })); }} label="Offer artwork" />
          <FieldError id="offer-artwork-error">{errors.image}</FieldError>
        </DashboardFormSection>

        <AudienceRuleFields value={audienceRules} onChange={setAudienceRules} required disabled={submitting} allowedUserTypes={["client", "agent", "employee", "telecaller"]} />
        <FieldError id="offer-audience-error">{errors.audience}</FieldError>

        <DashboardFormSection title="Terms and schedule" description="Summarize the important restriction where users can see it before leaving Dhanadhara.">
          <div><Label htmlFor="offer-terms">Terms summary <RequiredIndicator /></Label><Textarea id="offer-terms" name="terms_summary" value={termsSummary} maxLength={1000} onChange={(event) => setTermsSummary(event.target.value)} aria-invalid={Boolean(errors.termsSummary)} aria-describedby={errors.termsSummary ? "offer-terms-error" : undefined} /><FieldError id="offer-terms-error">{errors.termsSummary}</FieldError></div>
          <TextField id="offer-terms-url" label="Full terms URL" value={termsUrl} onChange={setTermsUrl} error={errors.termsUrl} placeholder="https://partner.example/terms" maxLength={1000} />
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="min-w-0"><Label htmlFor="offer-starts">Starts at</Label><Input id="offer-starts" name="starts_at" className="min-w-0 w-full" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></div>
            <div className="min-w-0"><Label htmlFor="offer-ends">Ends at</Label><Input id="offer-ends" name="ends_at" className="min-w-0 w-full" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></div>
            <div className="min-w-0"><Label htmlFor="offer-priority">Priority</Label><Input id="offer-priority" name="priority" className="min-w-0 w-full" inputMode="numeric" value={priority} onChange={(event) => setPriority(event.target.value.replace(/\D/g, ""))} aria-invalid={Boolean(errors.priority)} aria-describedby={errors.priority ? "offer-priority-error" : undefined} /><FieldError id="offer-priority-error">{errors.priority}</FieldError></div>
          </div>
          <FieldError id="offer-schedule-error">{errors.schedule}</FieldError>
        </DashboardFormSection>

        <Button type="submit" disabled={submitting || (editing && !dirty)}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}{submitting ? "Uploading and saving…" : editing ? "Save offer changes" : "Save private draft"}</Button>
      </form>
    </DashboardFormPage>
  );
}

function TextField({ id, label, value, onChange, error, required, ...inputProps }: { id: string; label: string; value: string; onChange: (value: string) => void; error?: string; required?: boolean } & Omit<React.ComponentProps<typeof Input>, "id" | "value" | "onChange">) {
  return <div><Label htmlFor={id}>{label}{required ? <RequiredIndicator /> : null}</Label><Input id={id} name={id.replace("offer-", "").replaceAll("-", "_")} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} {...inputProps} /><FieldError id={`${id}-error`}>{error}</FieldError></div>;
}
