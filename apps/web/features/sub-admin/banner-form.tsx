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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardFormPage } from "@/features/dashboard/dashboard-ui";
import {
  createBanner,
  listBannerTemplates,
  type BannerTemplate,
} from "@/lib/banners-api";
import {
  isPropertyCampaignTemplate,
  isLegacyPropertyCampaignTemplate,
  propertyCampaignHref,
  propertyCampaignImage,
  propertyMatchesCampaign,
} from "@/lib/banner-properties";
import { listOffers, type Offer } from "@/lib/offers-api";
import { getAdminProperties, type AdminProperty } from "@/lib/properties-api";
import { apiIssuesToFieldErrors, focusFirstInvalidField, integerError } from "@/lib/form-validation";
import { isSafeLocalHref } from "@/lib/safe-local-href";
import { AudienceRuleFields, emptyAudienceRules } from "./audience-rule-fields";
import { BannerPreview, formatOfferBadge } from "./cms-previews";
import { CmsPreviewFrame, type PreviewDevice } from "./cms-workspace";
import { PropertyCampaignSelect } from "./property-campaign-select";

type Schemas = components["schemas"];
type Placement = Schemas["BannerPlacement"];
type BannerType = Schemas["BannerType"];

// Keyed by Placement rather than a free array: Record<Placement, ...> is
// exhaustiveness-checked by tsc, so a new placement breaks `pnpm typecheck`
// instead of silently vanishing from this dropdown and leaving nobody able to
// author for it. The rendered order comes from PLACEMENTS below.
const PLACEMENT_META: Record<Placement, { label: string; note: string }> = {
  homepage: { label: "Homepage", note: "Homepage campaign carousel" },
  homepage_ad: {
    label: "Homepage sponsor ad",
    note: "One sponsor card above the homepage hero. Only one can be live at a time; to queue the next, open the live one and use Create replacement",
  },
  financial_services: {
    label: "Financial services",
    note: "Immediately below the header, before the Financial Services hero",
  },
  properties: {
    label: "Properties",
    note: "Immediately below the header, before the Properties hero",
  },
  dashboard: { label: "Authenticated dashboard", note: "Client and Agent dashboards" },
};

const PLACEMENT_ORDER: readonly Placement[] = [
  "homepage",
  "homepage_ad",
  "financial_services",
  "properties",
  "dashboard",
];

const PLACEMENTS: readonly { value: Placement; label: string; note: string }[] =
  PLACEMENT_ORDER.map((value) => ({ value, ...PLACEMENT_META[value] }));

const LINE_OPTIONS = [
  { value: "loans", label: "Loans" },
  { value: "real_estate", label: "Real Estate" },
  { value: "both", label: "Both lines" },
] as const;

const TYPE_OPTIONS: readonly { value: BannerType; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "personalized", label: "Personalized" },
  { value: "action", label: "Action" },
];

export function BannerForm({
  embedded = false,
  onCreated,
  onDirtyChange,
}: {
  embedded?: boolean;
  onCreated?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
} = {}) {
  const router = useRouter();
  const [placement, setPlacement] = React.useState<Placement>("homepage");
  const [businessLine, setBusinessLine] = React.useState<"loans" | "real_estate" | "both">(
    "both",
  );
  const [bannerType, setBannerType] = React.useState<BannerType>("default");
  const [templateId, setTemplateId] = React.useState("");
  const [offerId, setOfferId] = React.useState("");
  const [propertyId, setPropertyId] = React.useState("");
  const [templates, setTemplates] = React.useState<BannerTemplate[]>([]);
  const [offers, setOffers] = React.useState<Offer[]>([]);
  const [properties, setProperties] = React.useState<AdminProperty[]>([]);
  const [catalogLoading, setCatalogLoading] = React.useState(true);
  const [title, setTitle] = React.useState("");
  const [subtitle, setSubtitle] = React.useState("");
  const [ctaLabel, setCtaLabel] = React.useState("");
  const [deepLink, setDeepLink] = React.useState("");
  const [priority, setPriority] = React.useState("0");
  const [audienceRules, setAudienceRules] = React.useState(emptyAudienceRules);
  const [startsAt, setStartsAt] = React.useState("");
  const [endsAt, setEndsAt] = React.useState("");
  const [scheduleError, setScheduleError] = React.useState<string>();
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [previewDevice, setPreviewDevice] = React.useState<PreviewDevice>("desktop");
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    void Promise.all([listBannerTemplates(), listOffers(), getAdminProperties()]).then(([templateResult, offerResult, propertyResult]) => {
      if (cancelled) return;
      setCatalogLoading(false);
      if (templateResult.ok) setTemplates(templateResult.data);
      else toast.error("Could not load banner templates", { description: templateResult.error });
      if (offerResult.ok) {
        setOffers(
          offerResult.data.filter(
            (offer) => offer.status === "scheduled" || offer.status === "active",
          ),
        );
      } else {
        toast.error("Could not load offers", { description: offerResult.error });
      }
      if (propertyResult.ok) {
        setProperties(propertyResult.data.filter((property) => property.active));
      } else {
        toast.error("Could not load properties", { description: propertyResult.error });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    setTemplateId("");
    setOfferId("");
    setPropertyId("");
    if (placement === "financial_services") setBusinessLine("loans");
    if (placement === "properties") setBusinessLine("real_estate");
    if (placement === "dashboard" && bannerType === "personalized") return;
    if (placement !== "dashboard" && bannerType === "personalized") setBannerType("default");
  }, [bannerType, placement]);

  const placementTemplates = React.useMemo(
    () =>
      templates.filter(
        (template) =>
          template.placement === placement && !isLegacyPropertyCampaignTemplate(template),
      ),
    [placement, templates],
  );
  const selectedTemplate = templates.find((template) => template.id === templateId);
  const selectedOffer = offers.find((offer) => offer.id === offerId);
  const selectedProperty = properties.find((property) => property.id === propertyId);
  const needsOffer = selectedTemplate?.category_key === "offers";
  const allowsProperty = isPropertyCampaignTemplate(selectedTemplate);
  const matchingProperties = React.useMemo(
    () =>
      selectedTemplate
        ? properties.filter((property) => propertyMatchesCampaign(property, selectedTemplate))
        : [],
    [properties, selectedTemplate],
  );
  const matchingOffers = offers.filter(
    (offer) => businessLine === "both" || offer.business_line === "both" || offer.business_line === businessLine,
  );
  const isPublic = placement !== "dashboard";
  const dirty = Boolean(
    title ||
      subtitle ||
      ctaLabel ||
      deepLink ||
      templateId ||
      offerId ||
      propertyId ||
      priority !== "0" ||
      startsAt ||
      endsAt ||
      placement !== "homepage" ||
      businessLine !== "both" ||
      bannerType !== "default",
  );
  React.useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Title is required.";
    if (isPublic && !templateId) next.templateId = "Choose a template.";
    if (needsOffer && !offerId) next.offerId = "Choose the Offer this banner promotes.";
    if (deepLink.trim() && !isSafeLocalHref(deepLink.trim())) {
      next.deepLink = "Use a same-site path beginning with one slash.";
    }
    const priorityError = integerError(priority, "Priority", {
      required: true,
      min: 0,
      max: 2_147_483_647,
    });
    if (priorityError) next.priority = priorityError;
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      setScheduleError("End must be after start.");
      next.schedule = "End must be after start.";
    }
    if (bannerType === "personalized" && !audienceRules.user_types?.length) {
      next.audience = "Choose who should see this personalized banner.";
    }
    setFieldErrors(next);
    if (Object.keys(next).length > 0) {
      requestAnimationFrame(() => {
        if (formRef.current) focusFirstInvalidField(formRef.current);
      });
      return;
    }
    setScheduleError(undefined);

    setSubmitting(true);
    const result = await createBanner({
      placement,
      business_line: businessLine,
      banner_type: bannerType,
      template_id: isPublic ? templateId : null,
      offer_id: needsOffer ? offerId : null,
      property_id: allowsProperty && propertyId ? propertyId : null,
      title: title.trim(),
      subtitle: subtitle.trim() || null,
      cta_label: ctaLabel.trim() || null,
      image_key: null,
      deep_link: propertyId ? null : deepLink.trim() || null,
      audience_rules: bannerType === "personalized" ? audienceRules : emptyAudienceRules(),
      priority: Number(priority) || 0,
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    });
    setSubmitting(false);
    if (!result.ok) {
      const serverErrors = apiIssuesToFieldErrors(result.issues, {
        title: "title",
        template_id: "templateId",
        offer_id: "offerId",
        deep_link: "deepLink",
        priority: "priority",
        starts_at: "schedule",
        ends_at: "schedule",
      });
      if (Object.keys(serverErrors).length > 0) setFieldErrors(serverErrors);
      toast.error("Could not create banner", { description: result.error });
      return;
    }
    toast.success("Banner draft created", {
      description: "Submit it for Admin approval when it is ready.",
    });
    if (onCreated) onCreated();
    else router.push("/dashboard/banners");
  }

  return (
    <DashboardFormPage
      eyebrow="Campaign content"
      title="New banner"
      description="Select the governed artwork, then write the campaign message that appears over it."
      backHref="/dashboard/banners"
      backLabel="Back to banners"
      formTitle="Banner configuration"
      formDescription="Admin approval is required before this banner can go live."
      embedded={embedded}
      aside={
        <CmsPreviewFrame
          title="Exact banner preview"
          description="The selected artwork and live HTML copy use the public banner composition."
          device={previewDevice}
          onDeviceChange={setPreviewDevice}
        >
          <BannerPreview
            context={isPublic ? "public" : "dashboard"}
            placement={placement}
            banner={{
              banner_type: bannerType,
              title,
              subtitle: subtitle || null,
              cta_label: selectedProperty ? ctaLabel || "Enquire now" : ctaLabel || null,
              deep_link: selectedProperty ? propertyCampaignHref(selectedProperty) : deepLink || null,
              image_url:
                propertyCampaignImage(selectedProperty, selectedTemplate) ??
                selectedTemplate?.image_url,
              offer_badge: formatOfferBadge(selectedOffer),
              rera_verified: selectedProperty?.rera_verification_status === "verified",
            }}
          />
        </CmsPreviewFrame>
      }
    >
      <form ref={formRef} className="space-y-6" onSubmit={onSubmit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="placement">Placement</Label>
            <Select value={placement} onValueChange={(value) => setPlacement(value as Placement)}>
              <SelectTrigger id="placement"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLACEMENTS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-text-secondary">
              {PLACEMENTS.find((option) => option.value === placement)?.note}
            </p>
          </div>
          <div>
            <Label htmlFor="business-line">Business line</Label>
            <Select
              value={businessLine}
              disabled={placement === "financial_services" || placement === "properties"}
              onValueChange={(value) => setBusinessLine(value as typeof businessLine)}
            >
              <SelectTrigger id="business-line"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LINE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isPublic ? (
          <div>
            <Label htmlFor="banner-template">Artwork template<RequiredIndicator /></Label>
            <Select
              value={templateId || undefined}
              onValueChange={(value) => {
                setTemplateId(value);
                setOfferId("");
                setPropertyId("");
                setFieldErrors((current) => { const next = { ...current }; delete next.templateId; return next; });
              }}
              disabled={catalogLoading}
            >
              <SelectTrigger id="banner-template" aria-required="true" aria-invalid={Boolean(fieldErrors.templateId)} aria-describedby={fieldErrors.templateId ? "banner-template-error" : undefined}>
                <SelectValue placeholder={catalogLoading ? "Loading templates…" : "Choose a category"} />
              </SelectTrigger>
              <SelectContent>
                {placementTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.label} · version {template.version}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError id="banner-template-error" className="mt-1">{fieldErrors.templateId}</FieldError>
            <p className="mt-1 text-xs text-text-secondary">
              Artwork is controlled by Admin. Your title, subtitle, and button remain editable HTML.
            </p>
          </div>
        ) : (
          <div>
            <Label htmlFor="banner-type">Dashboard banner type</Label>
            <Select value={bannerType} onValueChange={(value) => setBannerType(value as BannerType)}>
              <SelectTrigger id="banner-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {needsOffer ? (
          <div>
            <Label htmlFor="linked-offer">Linked Offer<RequiredIndicator /></Label>
            <Select value={offerId || undefined} onValueChange={(value) => { setOfferId(value); setFieldErrors((current) => { const next = { ...current }; delete next.offerId; return next; }); }}>
              <SelectTrigger id="linked-offer" aria-required="true" aria-invalid={Boolean(fieldErrors.offerId)} aria-describedby={fieldErrors.offerId ? "linked-offer-error" : undefined}><SelectValue placeholder="Choose an active or scheduled Offer" /></SelectTrigger>
              <SelectContent>
                {matchingOffers.map((offer) => (
                  <SelectItem key={offer.id} value={offer.id}>{offer.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError id="linked-offer-error" className="mt-1">{fieldErrors.offerId}</FieldError>
            <p className="mt-1 text-xs text-text-secondary">
              The public badge is generated from this Offer and disappears if the Offer is no longer active.
            </p>
          </div>
        ) : null}

        {allowsProperty ? (
          <div>
            <Label htmlFor="linked-property">Advertised property (optional)</Label>
            <PropertyCampaignSelect
              id="linked-property"
              properties={matchingProperties}
              value={propertyId}
              onChange={setPropertyId}
              disabled={catalogLoading}
            />
            <p className="mt-1 text-xs text-text-secondary">
              The approved property cover, enquiry destination, and RERA VERIFIED badge are generated from this listing.
            </p>
          </div>
        ) : null}

        <div>
          <Label htmlFor="title">Title<RequiredIndicator /></Label>
          <Input id="title" value={title} onChange={(event) => { setTitle(event.target.value); setFieldErrors((current) => { const next = { ...current }; delete next.title; return next; }); }} maxLength={500} aria-invalid={Boolean(fieldErrors.title)} aria-describedby={fieldErrors.title ? "banner-title-error" : undefined} />
          <FieldError id="banner-title-error" className="mt-1">{fieldErrors.title}</FieldError>
        </div>
        <div>
          <Label htmlFor="subtitle">Subtitle</Label>
          <Input id="subtitle" value={subtitle} onChange={(event) => setSubtitle(event.target.value)} maxLength={300} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="cta-label">Button label</Label>
            <Input id="cta-label" value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} maxLength={40} />
          </div>
          <div>
            <Label htmlFor="deep-link">Internal destination</Label>
            <Input
              id="deep-link"
              placeholder="/loans"
              value={selectedProperty ? propertyCampaignHref(selectedProperty) : deepLink}
              onChange={(event) => { setDeepLink(event.target.value); setFieldErrors((current) => { const next = { ...current }; delete next.deepLink; return next; }); }}
              maxLength={1000}
              disabled={Boolean(selectedProperty)}
              aria-invalid={Boolean(fieldErrors.deepLink)}
              aria-describedby={["deep-link-help", fieldErrors.deepLink ? "deep-link-error" : undefined].filter(Boolean).join(" ")}
            />
          </div>
        </div>
        <p id="deep-link-help" className="-mt-3 text-xs text-text-secondary">
          {selectedProperty
            ? "Property enquiries always use the server-generated contact destination."
            : "Use a same-site path beginning with one slash. Unsafe or incomplete links do not render a button."}
        </p>
        <FieldError id="deep-link-error">{fieldErrors.deepLink}</FieldError>

        {placement === "dashboard" && bannerType === "personalized" ? (
          <div aria-invalid={Boolean(fieldErrors.audience)} aria-describedby={fieldErrors.audience ? "banner-audience-error" : undefined}>
            <AudienceRuleFields value={audienceRules} onChange={(next) => { setAudienceRules(next); setFieldErrors((current) => { const updated = { ...current }; delete updated.audience; return updated; }); }} required disabled={submitting} />
            <FieldError id="banner-audience-error">{fieldErrors.audience}</FieldError>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="priority">Priority</Label>
            <Input id="priority" inputMode="numeric" value={priority} onChange={(event) => { setPriority(event.target.value.replace(/\D/g, "")); setFieldErrors((current) => { const next = { ...current }; delete next.priority; return next; }); }} aria-invalid={Boolean(fieldErrors.priority)} aria-describedby={fieldErrors.priority ? "banner-priority-error" : undefined} />
            <FieldError id="banner-priority-error" className="mt-1">{fieldErrors.priority}</FieldError>
          </div>
          <div>
            <Label htmlFor="starts-at">Goes live at</Label>
            <Input id="starts-at" type="datetime-local" value={startsAt} onChange={(event) => { setStartsAt(event.target.value); setScheduleError(undefined); setFieldErrors((current) => { const next = { ...current }; delete next.schedule; return next; }); }} aria-invalid={Boolean(fieldErrors.schedule)} aria-describedby={fieldErrors.schedule ? "banner-schedule-error" : undefined} />
          </div>
          <div>
            <Label htmlFor="ends-at">Archives at</Label>
            <Input id="ends-at" type="datetime-local" value={endsAt} onChange={(event) => { setEndsAt(event.target.value); setScheduleError(undefined); setFieldErrors((current) => { const next = { ...current }; delete next.schedule; return next; }); }} aria-invalid={Boolean(fieldErrors.schedule)} aria-describedby={fieldErrors.schedule ? "banner-schedule-error" : undefined} />
          </div>
        </div>
        <p className="-mt-3 text-xs text-text-secondary">
          Leave the dates blank to publish on the next scheduler tick after approval with no automatic end.
        </p>
        <FieldError id="banner-schedule-error">{scheduleError ?? fieldErrors.schedule}</FieldError>

        <Button type="submit" disabled={submitting || catalogLoading} className="w-full sm:w-auto">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {submitting ? "Saving draft…" : "Save draft"}
        </Button>
      </form>
    </DashboardFormPage>
  );
}
