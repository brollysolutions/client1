"use client";
/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { components } from "@contracts/generated/schema";

import { Button } from "@/components/ui/button";
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardFormPage } from "@/features/dashboard/dashboard-ui";
import type { PreviewDevice } from "@/features/dashboard/workspace-dialog";
import {
  ARTWORK_SURFACES,
  BANNER_USAGE_TYPES_BY_PLACEMENT,
  formatTargetSize,
  primaryUsageType,
} from "@/lib/campaign-artwork";
import { createBanner, listBannerTemplates, type BannerTemplate } from "@/lib/banners-api";
import {
  isLegacyPropertyCampaignTemplate,
  isPropertyCampaignTemplate,
  propertyCampaignHref,
  propertyCampaignImage,
  propertyMatchesCampaign,
} from "@/lib/banner-properties";
import { apiIssuesToFieldErrors, focusFirstInvalidField, integerError } from "@/lib/form-validation";
import { getAdminProperties, type AdminProperty } from "@/lib/properties-api";
import { isSafeLocalHref } from "@/lib/safe-local-href";
import { cn } from "@/lib/utils";

import { AudienceRuleFields, emptyAudienceRules } from "./audience-rule-fields";
import { CampaignMediaPicker } from "./campaign-media-picker";
import { CampaignPreviewPanel } from "./campaign-preview-panel";
import { BannerPreview, placementLabel } from "./cms-previews";
import { PropertyCampaignSelect } from "./property-campaign-select";

type Schemas = components["schemas"];
type Placement = Schemas["BannerPlacement"];
type BannerType = Schemas["BannerType"];
type BusinessLine = "loans" | "real_estate" | "both";

// Keyed by Placement rather than a free array: Record<Placement, ...> is
// exhaustiveness-checked by tsc, so a new placement breaks `pnpm typecheck`
// instead of silently vanishing from this picker and leaving nobody able to
// author for it.
const PLACEMENT_META: Record<
  Placement,
  { label: string; where: string; note: string; thumbnail: string }
> = {
  homepage: {
    label: "Homepage",
    where: "Home page hero",
    note: "The full-bleed carousel visitors meet first. Up to seven campaigns rotate here.",
    thumbnail: "/banner-templates/homepage/general.webp",
  },
  homepage_ad: {
    label: "Homepage sponsor",
    where: "Above the Home page hero",
    note: "One sponsor card at a time. To queue the next, open the live one and use Create replacement.",
    thumbnail: "/banner-templates/homepage_ad/sponsor.webp",
  },
  financial_services: {
    label: "Financial Services",
    where: "Below the header on /loans",
    note: "Loans-line campaigns, shown before the Financial Services hero.",
    thumbnail: "/banner-templates/financial_services/home-loan.webp",
  },
  properties: {
    label: "Properties",
    where: "Below the header on /real-estate",
    note: "Real Estate campaigns, shown before the Properties hero.",
    thumbnail: "/banner-templates/properties/apartments.webp",
  },
  dashboard: {
    label: "Signed-in dashboard",
    where: "Client and Agent dashboards",
    note: "Only signed-in users see this, and it can be targeted at specific audiences.",
    thumbnail: "/banner-templates/dashboard/loan-progress.webp",
  },
};

const PLACEMENT_ORDER: readonly Placement[] = [
  "homepage",
  "homepage_ad",
  "financial_services",
  "properties",
  "dashboard",
];

const LINE_OPTIONS: readonly { value: BusinessLine; label: string }[] = [
  { value: "both", label: "Both lines" },
  { value: "loans", label: "Loans" },
  { value: "real_estate", label: "Real Estate" },
];

const TYPE_OPTIONS: readonly { value: BannerType; label: string; note: string }[] = [
  { value: "default", label: "Standard", note: "Shown to everyone who reaches the dashboard." },
  {
    value: "personalized",
    label: "Targeted",
    note: "Shown only to the audience you choose below.",
  },
  { value: "action", label: "Action", note: "Prompts one specific next step." },
];

const STEPS = [
  { key: "where", label: "Where" },
  { key: "artwork", label: "Artwork" },
  { key: "message", label: "Message" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

/** Line forced by the placement, or null when the author may choose. */
function forcedLine(placement: Placement): BusinessLine | null {
  if (placement === "financial_services") return "loans";
  if (placement === "properties") return "real_estate";
  return null;
}

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
  const [step, setStep] = React.useState<StepKey>("where");
  const [placement, setPlacement] = React.useState<Placement>("homepage");
  const [businessLine, setBusinessLine] = React.useState<BusinessLine>("both");
  const [bannerType, setBannerType] = React.useState<BannerType>("default");
  const [templateId, setTemplateId] = React.useState("");
  const [propertyId, setPropertyId] = React.useState("");
  const [mediaAssetId, setMediaAssetId] = React.useState("");
  const [mediaPreviewUrl, setMediaPreviewUrl] = React.useState<string | null>(null);
  const [templates, setTemplates] = React.useState<BannerTemplate[]>([]);
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
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [previewDevice, setPreviewDevice] = React.useState<PreviewDevice>("desktop");
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    void Promise.all([listBannerTemplates(), getAdminProperties()]).then(
      ([templateResult, propertyResult]) => {
        if (cancelled) return;
        setCatalogLoading(false);
        if (templateResult.ok) setTemplates(templateResult.data);
        else toast.error("Could not load category artwork", { description: templateResult.error });
        if (propertyResult.ok) {
          setProperties(propertyResult.data.filter((property) => property.active));
        } else {
          toast.error("Could not load properties", { description: propertyResult.error });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const isPublic = placement !== "dashboard";

  function choosePlacement(next: Placement) {
    setPlacement(next);
    // Artwork is surface-specific: a 5:2 section image cannot follow the author
    // to the 9:5 hero, so every artwork choice resets with the placement.
    setTemplateId("");
    setPropertyId("");
    setMediaAssetId("");
    setMediaPreviewUrl(null);
    const locked = forcedLine(next);
    if (locked) setBusinessLine(locked);
    if (next !== "dashboard" && bannerType === "personalized") setBannerType("default");
    setFieldErrors({});
  }

  const placementTemplates = React.useMemo(
    () =>
      templates.filter(
        (template) =>
          template.placement === placement && !isLegacyPropertyCampaignTemplate(template),
      ),
    [placement, templates],
  );
  const selectedTemplate = templates.find((template) => template.id === templateId);
  const selectedProperty = properties.find((property) => property.id === propertyId);
  const allowsProperty = isPropertyCampaignTemplate(selectedTemplate);
  const matchingProperties = React.useMemo(
    () =>
      selectedTemplate
        ? properties.filter((property) => propertyMatchesCampaign(property, selectedTemplate))
        : [],
    [properties, selectedTemplate],
  );

  const hasArtwork = Boolean(templateId || mediaAssetId);
  const dirty = Boolean(
    title ||
      subtitle ||
      ctaLabel ||
      deepLink ||
      templateId ||
      propertyId ||
      mediaAssetId ||
      priority !== "0" ||
      startsAt ||
      endsAt ||
      placement !== "homepage" ||
      businessLine !== "both" ||
      bannerType !== "default",
  );
  React.useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  function selectTemplate(id: string) {
    setTemplateId(id);
    // The API accepts exactly one artwork source per campaign.
    setMediaAssetId("");
    setMediaPreviewUrl(null);
    setPropertyId("");
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.artwork;
      return next;
    });
  }

  function selectMedia(id: string, url: string | null) {
    setMediaAssetId(id);
    setMediaPreviewUrl(url);
    if (id) {
      setTemplateId("");
      setPropertyId("");
    }
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.artwork;
      return next;
    });
  }

  function validateStep(target: StepKey): Record<string, string> {
    if (target === "artwork") {
      return hasArtwork ? {} : { artwork: "Choose artwork for this campaign." };
    }
    if (target === "message") {
      const next: Record<string, string> = {};
      if (!title.trim()) next.title = "Title is required.";
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
        next.schedule = "End must be after start.";
      }
      if (bannerType === "personalized" && !audienceRules.user_types?.length) {
        next.audience = "Choose who should see this targeted banner.";
      }
      return next;
    }
    return {};
  }

  function goNext() {
    const stepIndex = STEPS.findIndex((item) => item.key === step);
    const current = STEPS[stepIndex].key;
    // "Where" has a default for every field, so only later steps can block.
    const errors = current === "where" ? {} : validateStep(current);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      requestAnimationFrame(() => {
        if (formRef.current) focusFirstInvalidField(formRef.current);
      });
      return;
    }
    setStep(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)].key);
  }

  function goBack() {
    const stepIndex = STEPS.findIndex((item) => item.key === step);
    setStep(STEPS[Math.max(stepIndex - 1, 0)].key);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const errors = { ...validateStep("artwork"), ...validateStep("message") };
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      if (errors.artwork) setStep("artwork");
      else setStep("message");
      requestAnimationFrame(() => {
        if (formRef.current) focusFirstInvalidField(formRef.current);
      });
      return;
    }

    setSubmitting(true);
    const result = await createBanner({
      placement,
      business_line: businessLine,
      banner_type: bannerType,
      template_id: templateId || null,
      offer_id: null,
      property_id: allowsProperty && propertyId ? propertyId : null,
      title: title.trim(),
      subtitle: subtitle.trim() || null,
      cta_label: ctaLabel.trim() || null,
      image_key: null,
      media_asset_id: mediaAssetId || null,
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
        template_id: "artwork",
        media_asset_id: "artwork",
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

  const previewImage =
    propertyCampaignImage(selectedProperty, selectedTemplate) ??
    selectedTemplate?.image_url ??
    mediaPreviewUrl;

  return (
    <DashboardFormPage
      title="New banner"
      description="Choose where the campaign runs, pick its artwork, then write the message."
      backHref="/dashboard/banners"
      backLabel="Back to banners"
      formTitle="Banner"
      formDescription="Saved as a private draft. Admin approval is required before it goes live."
      embedded={embedded}
      wide
    >
      <form ref={formRef} className="space-y-6" onSubmit={onSubmit} noValidate>
        <StepIndicator current={step} onSelect={setStep} hasArtwork={hasArtwork} />

        <CampaignPreviewPanel
          device={previewDevice}
          onDeviceChange={setPreviewDevice}
          caption={placementLabel(placement)}
        >
          <BannerPreview
            context={isPublic ? "public" : "dashboard"}
            placement={placement}
            banner={{
              banner_type: bannerType,
              title,
              subtitle: subtitle || null,
              cta_label: selectedProperty ? ctaLabel || "Enquire now" : ctaLabel || null,
              deep_link: selectedProperty
                ? propertyCampaignHref(selectedProperty)
                : deepLink || null,
              image_url: previewImage,
              rera_verified: selectedProperty?.rera_verification_status === "verified",
            }}
          />
        </CampaignPreviewPanel>

        {step === "where" ? (
          <StepPanel
            title="Where should this campaign appear?"
            description="Each surface has its own shape and audience, so this decides which artwork you can use."
          >
            <div
              role="radiogroup"
              aria-label="Placement"
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            >
              {PLACEMENT_ORDER.map((value) => {
                const meta = PLACEMENT_META[value];
                const selected = placement === value;
                const surface = ARTWORK_SURFACES[primaryUsageType(value)];
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => choosePlacement(value)}
                    className={cn(
                      "overflow-hidden rounded-xl border bg-background text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "border-[var(--nav-primary)] ring-2 ring-[var(--nav-primary)]/25"
                        : "border-border hover:border-[var(--nav-primary)]/40",
                    )}
                  >
                    <span className={cn("relative block w-full bg-muted", surface.aspectClass)}>
                      <img
                        src={meta.thumbnail}
                        alt=""
                        width={surface.width}
                        height={surface.height}
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                      {selected ? (
                        <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-[var(--nav-primary)] text-white">
                          <Check className="h-3.5 w-3.5" aria-hidden />
                        </span>
                      ) : null}
                    </span>
                    <span className="block space-y-1 p-3">
                      <span className="block text-sm font-semibold text-text-primary">
                        {meta.label}
                      </span>
                      <span className="block text-xs text-text-secondary">{meta.where}</span>
                      <span className="block text-xs leading-5 text-text-secondary">
                        {meta.note}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl border border-border p-4">
              <Label>Business line</Label>
              {forcedLine(placement) ? (
                <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-[var(--nav-tint)] px-3 py-1 text-sm font-medium text-[var(--nav-primary)]">
                  {LINE_OPTIONS.find((option) => option.value === forcedLine(placement))?.label}
                  <span className="text-xs font-normal text-text-secondary">
                    set by this placement
                  </span>
                </p>
              ) : (
                <div
                  role="radiogroup"
                  aria-label="Business line"
                  className="mt-2 flex flex-wrap gap-2"
                >
                  {LINE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={businessLine === option.value}
                      onClick={() => setBusinessLine(option.value)}
                      className={cn(
                        "rounded-full border px-4 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        businessLine === option.value
                          ? "border-[var(--nav-primary)] bg-[var(--nav-tint)] text-[var(--nav-primary)]"
                          : "border-border text-text-secondary hover:border-[var(--nav-primary)]/40",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {placement === "dashboard" ? (
              <div className="rounded-xl border border-border p-4">
                <Label>Banner kind</Label>
                <div
                  role="radiogroup"
                  aria-label="Banner kind"
                  className="mt-2 grid gap-2 sm:grid-cols-3"
                >
                  {TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={bannerType === option.value}
                      onClick={() => setBannerType(option.value)}
                      className={cn(
                        "rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        bannerType === option.value
                          ? "border-[var(--nav-primary)] bg-[var(--nav-tint)]/50"
                          : "border-border hover:border-[var(--nav-primary)]/40",
                      )}
                    >
                      <span className="block text-sm font-medium text-text-primary">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-text-secondary">
                        {option.note}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </StepPanel>
        ) : null}

        {step === "artwork" ? (
          <StepPanel
            title="Choose the artwork"
            description={`${ARTWORK_SURFACES[primaryUsageType(placement)].label} · ${formatTargetSize(
              ARTWORK_SURFACES[primaryUsageType(placement)],
            )}. Pick a ready-made image or upload your own.`}
          >
            {isPublic && placementTemplates.length > 0 ? (
              <section className="space-y-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h4 className="text-sm font-semibold text-text-primary">Category artwork</h4>
                  <span className="text-xs text-text-secondary">{placementTemplates.length}</span>
                </div>
                <p className="-mt-2 text-xs text-text-secondary">
                  Reviewed artwork for each public category. Choosing one also decides which
                  listings the campaign may promote.
                </p>
                <div
                  role="radiogroup"
                  aria-label="Category artwork"
                  className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
                >
                  {placementTemplates.map((template) => {
                    const selected = templateId === template.id;
                    return (
                      <button
                        key={template.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => selectTemplate(template.id)}
                        className={cn(
                          "overflow-hidden rounded-xl border bg-background text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected
                            ? "border-[var(--nav-primary)] ring-2 ring-[var(--nav-primary)]/25"
                            : "border-border hover:border-[var(--nav-primary)]/40",
                        )}
                      >
                        <span
                          className={cn(
                            "relative block w-full bg-muted",
                            ARTWORK_SURFACES[primaryUsageType(placement)].aspectClass,
                          )}
                        >
                          <img
                            src={template.image_url}
                            alt=""
                            width={ARTWORK_SURFACES[primaryUsageType(placement)].width}
                            height={ARTWORK_SURFACES[primaryUsageType(placement)].height}
                            loading="lazy"
                            decoding="async"
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                          {selected ? (
                            <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-[var(--nav-primary)] text-white">
                              <Check className="h-3.5 w-3.5" aria-hidden />
                            </span>
                          ) : null}
                        </span>
                        <span className="block space-y-1 p-2.5">
                          <span className="block truncate text-xs font-medium text-text-primary">
                            {template.label}
                          </span>
                          <span className="block text-[11px] text-text-secondary">
                            Version {template.version}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <CampaignMediaPicker
              usageTypes={BANNER_USAGE_TYPES_BY_PLACEMENT[placement]}
              businessLine={businessLine}
              value={mediaAssetId}
              onChange={(id, asset) => selectMedia(id, asset?.image_url ?? null)}
              label={isPublic ? "Media Library artwork" : "Artwork"}
              invalid={Boolean(fieldErrors.artwork)}
              describedBy={fieldErrors.artwork ? "banner-artwork-error" : undefined}
            />
            <FieldError id="banner-artwork-error">{fieldErrors.artwork}</FieldError>

            {allowsProperty ? (
              <div className="rounded-xl border border-border p-4">
                <Label htmlFor="linked-property">Advertised property (optional)</Label>
                <PropertyCampaignSelect
                  id="linked-property"
                  properties={matchingProperties}
                  value={propertyId}
                  onChange={setPropertyId}
                  disabled={catalogLoading}
                />
                <p className="mt-2 text-xs text-text-secondary">
                  The approved cover image, enquiry destination, and RERA VERIFIED badge are
                  generated from the listing rather than typed here.
                </p>
              </div>
            ) : null}
          </StepPanel>
        ) : null}

        {step === "message" ? (
          <StepPanel
            title="Write the message"
            description="This copy sits over the artwork. Keep it short enough to read at a glance."
          >
            <div className="grid gap-4">
              <div>
                <Label htmlFor="title">
                  Title
                  <RequiredIndicator />
                </Label>
                <Input
                  id="title"
                  name="title"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setFieldErrors((current) => {
                      const next = { ...current };
                      delete next.title;
                      return next;
                    });
                  }}
                  maxLength={500}
                  aria-invalid={Boolean(fieldErrors.title)}
                  aria-describedby={fieldErrors.title ? "banner-title-error" : undefined}
                />
                <FieldError id="banner-title-error" className="mt-1">
                  {fieldErrors.title}
                </FieldError>
              </div>
              <div>
                <Label htmlFor="subtitle">Subtitle</Label>
                <Input
                  id="subtitle"
                  name="subtitle"
                  value={subtitle}
                  onChange={(event) => setSubtitle(event.target.value)}
                  maxLength={300}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="cta-label">Button label</Label>
                  <Input
                    id="cta-label"
                    name="cta_label"
                    value={ctaLabel}
                    onChange={(event) => setCtaLabel(event.target.value)}
                    maxLength={40}
                  />
                </div>
                <div>
                  <Label htmlFor="deep-link">Button destination</Label>
                  <Input
                    id="deep-link"
                    name="deep_link"
                    placeholder="/loans"
                    value={selectedProperty ? propertyCampaignHref(selectedProperty) : deepLink}
                    onChange={(event) => {
                      setDeepLink(event.target.value);
                      setFieldErrors((current) => {
                        const next = { ...current };
                        delete next.deepLink;
                        return next;
                      });
                    }}
                    maxLength={1000}
                    disabled={Boolean(selectedProperty)}
                    aria-invalid={Boolean(fieldErrors.deepLink)}
                    aria-describedby={["deep-link-help", fieldErrors.deepLink && "deep-link-error"]
                      .filter(Boolean)
                      .join(" ")}
                  />
                </div>
              </div>
              <p id="deep-link-help" className="-mt-2 text-xs text-text-secondary">
                {selectedProperty
                  ? "Property enquiries always use the server-generated contact destination."
                  : "A same-site path beginning with one slash. Without a valid label and destination, no button is rendered."}
              </p>
              <FieldError id="deep-link-error">{fieldErrors.deepLink}</FieldError>
            </div>

            {placement === "dashboard" && bannerType === "personalized" ? (
              <div
                className="rounded-xl border border-border p-4"
                aria-invalid={Boolean(fieldErrors.audience)}
                aria-describedby={fieldErrors.audience ? "banner-audience-error" : undefined}
              >
                <AudienceRuleFields
                  value={audienceRules}
                  onChange={(next) => {
                    setAudienceRules(next);
                    setFieldErrors((current) => {
                      const updated = { ...current };
                      delete updated.audience;
                      return updated;
                    });
                  }}
                  required
                  disabled={submitting}
                />
                <FieldError id="banner-audience-error">{fieldErrors.audience}</FieldError>
              </div>
            ) : null}

            <div className="rounded-xl border border-border p-4">
              <h4 className="text-sm font-semibold text-text-primary">Order and schedule</h4>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="priority">Priority</Label>
                  <Input
                    id="priority"
                    name="priority"
                    inputMode="numeric"
                    value={priority}
                    onChange={(event) => {
                      setPriority(event.target.value.replace(/\D/g, ""));
                      setFieldErrors((current) => {
                        const next = { ...current };
                        delete next.priority;
                        return next;
                      });
                    }}
                    aria-invalid={Boolean(fieldErrors.priority)}
                    aria-describedby={fieldErrors.priority ? "banner-priority-error" : undefined}
                  />
                  <FieldError id="banner-priority-error" className="mt-1">
                    {fieldErrors.priority}
                  </FieldError>
                </div>
                <div>
                  <Label htmlFor="starts-at">Goes live at</Label>
                  <Input
                    id="starts-at"
                    name="starts_at"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(event) => {
                      setStartsAt(event.target.value);
                      setFieldErrors((current) => {
                        const next = { ...current };
                        delete next.schedule;
                        return next;
                      });
                    }}
                    aria-invalid={Boolean(fieldErrors.schedule)}
                    aria-describedby={fieldErrors.schedule ? "banner-schedule-error" : undefined}
                  />
                </div>
                <div>
                  <Label htmlFor="ends-at">Archives at</Label>
                  <Input
                    id="ends-at"
                    name="ends_at"
                    type="datetime-local"
                    value={endsAt}
                    onChange={(event) => {
                      setEndsAt(event.target.value);
                      setFieldErrors((current) => {
                        const next = { ...current };
                        delete next.schedule;
                        return next;
                      });
                    }}
                    aria-invalid={Boolean(fieldErrors.schedule)}
                    aria-describedby={fieldErrors.schedule ? "banner-schedule-error" : undefined}
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-text-secondary">
                Leave both blank to publish on the next scheduler tick after approval, with no
                automatic end.
              </p>
              <FieldError id="banner-schedule-error">{fieldErrors.schedule}</FieldError>
            </div>
          </StepPanel>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={goBack}
            disabled={step === "where" || submitting}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {step === "artwork" ? (
              <Button type="submit" variant="outline" disabled={submitting || catalogLoading}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Save draft
              </Button>
            ) : null}
            {step === "message" ? (
              <Button type="submit" disabled={submitting || catalogLoading}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {submitting ? "Saving…" : "Save draft"}
              </Button>
            ) : (
              <Button type="button" onClick={goNext} disabled={catalogLoading}>
                Next
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </form>
    </DashboardFormPage>
  );
}

function StepIndicator({
  current,
  onSelect,
  hasArtwork,
}: {
  current: StepKey;
  onSelect: (step: StepKey) => void;
  hasArtwork: boolean;
}) {
  const currentIndex = STEPS.findIndex((item) => item.key === current);
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Banner steps">
      {STEPS.map((item, index) => {
        const state = index === currentIndex ? "current" : index < currentIndex ? "done" : "todo";
        // Going forward past Artwork without artwork would leave the author on a
        // step whose Save is guaranteed to bounce them back.
        const reachable = index <= currentIndex || (index === 2 ? hasArtwork : true);
        return (
          <li key={item.key} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => reachable && onSelect(item.key)}
              disabled={!reachable}
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                state === "current"
                  ? "border-[var(--nav-primary)] bg-[var(--nav-tint)] font-medium text-[var(--nav-primary)]"
                  : "border-border text-text-secondary hover:border-[var(--nav-primary)]/40",
              )}
            >
              <span
                className={cn(
                  "grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold",
                  state === "done"
                    ? "bg-[var(--nav-primary)] text-white"
                    : state === "current"
                      ? "bg-[var(--nav-primary)] text-white"
                      : "bg-muted text-text-secondary",
                )}
              >
                {state === "done" ? <Check className="h-3 w-3" aria-hidden /> : index + 1}
              </span>
              {item.label}
            </button>
            {index < STEPS.length - 1 ? (
              <span aria-hidden className="h-px w-4 bg-border sm:w-8" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function StepPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-heading text-base font-semibold text-text-primary">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-text-secondary">{description}</p>
      </div>
      {children}
    </section>
  );
}
