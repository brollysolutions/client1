"use client";

import * as React from "react";
import Image from "next/image";
import { ArrowDown, ArrowUp, FileText, Loader2, Rotate3D, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CLOSE_BUTTON_CLASS } from "@/components/ui/close-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardFormPage, DashboardFormSection } from "@/features/dashboard/dashboard-ui";
import { LISTING_INTENT_OPTIONS } from "@/lib/property-submit";
import { PROPERTY_SUBTYPE_GROUPS } from "@/lib/property-taxonomy";
import type { Submission } from "@/lib/property-submissions-api";
import { cn } from "@/lib/utils";
import { ListingLinksField } from "./listing-links-field";
import { PropertyDetailFields } from "./property-detail-fields";
import { useSubmitProperty } from "./use-submit-property";

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-sm text-destructive">{msg}</p>;
}

export function SubmitPropertyForm({
  submission,
  adminCorrection = false,
}: {
  submission?: Submission;
  adminCorrection?: boolean;
}) {
  const f = useSubmitProperty(submission, { adminCorrection });
  const isRent = f.form.listingIntent === "rent";
  const [amenityDraft, setAmenityDraft] = React.useState("");
  const imagePreviews = React.useMemo(
    () => f.form.images.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [f.form.images],
  );
  const panoramaPreview = React.useMemo(
    () => (f.form.panorama ? URL.createObjectURL(f.form.panorama) : null),
    [f.form.panorama],
  );

  React.useEffect(
    () => () => {
      imagePreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    },
    [imagePreviews],
  );
  React.useEffect(
    () => () => {
      if (panoramaPreview) URL.revokeObjectURL(panoramaPreview);
    },
    [panoramaPreview],
  );

  const commitAmenity = () => {
    f.addAmenity(amenityDraft);
    setAmenityDraft("");
  };

  const moveImage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= f.form.images.length) return;
    const next = [...f.form.images];
    [next[index], next[target]] = [next[target], next[index]];
    f.setImages(next);
  };

  return (
    <DashboardFormPage
      title={
        f.adminCorrection ? "Correct approved listing" : f.editing ? "Edit property" : "Submit a property"
      }
      description={
        f.adminCorrection
          ? "Stage corrected facts with a mandatory audit reason. The published listing stays unchanged until RERA review and approval."
          : f.editing
          ? "Update the listing facts. Approved changes return to Admin review while the published version stays available."
          : "Capture listing details, managed media, and private reviewer documents for Admin review."
      }
      backHref={f.adminCorrection ? "/dashboard/property-review" : "/dashboard/my-submissions"}
      backLabel={f.adminCorrection ? "Back to property review" : "Back to submissions"}
      formTitle={f.adminCorrection ? "Controlled correction" : f.editing ? "Listing details" : "Listing submission"}
      formDescription={
        f.adminCorrection
          ? "Only listing facts change here. Property identity, submitter, business line, and reviewed media are retained."
          : f.editing
          ? "Managed media remains unchanged while you edit the approved listing facts."
          : "Nothing becomes public until the review team approves the submission."
      }
    >
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void f.submit();
        }}
      >
        {f.adminCorrection ? (
          <DashboardFormSection
            title="Correction evidence"
            description="Explain what was verified and why the approved facts need correction."
          >
            <div>
              <Label htmlFor="correction-reason">
                Correction reason <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <Textarea
                id="correction-reason"
                required
                rows={4}
                maxLength={1000}
                value={f.correctionReason}
                onChange={(event) => f.setCorrectionReason(event.target.value)}
                aria-invalid={Boolean(f.errors.correctionReason)}
                aria-describedby={f.errors.correctionReason ? "correction-reason-error" : undefined}
                placeholder="Record the verified source and the correction needed. Avoid unnecessary personal data."
              />
              <div id="correction-reason-error">
                <FieldError msg={f.errors.correctionReason} />
              </div>
            </div>
          </DashboardFormSection>
        ) : null}

        <DashboardFormSection
          title="Listing basics"
          description="Provide the public title, property type, and catalogue category."
        >
          <div>
            <Label htmlFor="listing-intent">Listing for</Label>
            <Select
              value={f.form.listingIntent}
              onValueChange={(value) =>
                f.setField("listingIntent", value as typeof f.form.listingIntent)
              }
            >
              <SelectTrigger id="listing-intent" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LISTING_INTENT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-text-secondary">
              This changes the price fields below and how the listing is shown to buyers.
            </p>
          </div>
          <div>
            <Label htmlFor="title">Listing name</Label>
            <Input id="title" value={f.form.title} onChange={(e) => f.setField("title", e.target.value)} maxLength={200} />
            <FieldError msg={f.errors.title} />
          </div>
          <div>
            <Label htmlFor="type">Display type</Label>
            <Input id="type" placeholder="e.g. Apartment" value={f.form.type} onChange={(e) => f.setField("type", e.target.value)} maxLength={40} />
            <FieldError msg={f.errors.type} />
          </div>
          <div>
            <Label htmlFor="property-type">Property type</Label>
            <Select
              value={f.form.propertySubtype}
              onValueChange={(value) =>
                f.setField("propertySubtype", value as typeof f.form.propertySubtype)
              }
            >
              <SelectTrigger id="property-type" className="w-full">
                <SelectValue placeholder="Choose a property type" />
              </SelectTrigger>
              <SelectContent>
                {PROPERTY_SUBTYPE_GROUPS.map((group) => (
                  <SelectGroup key={group.heading}>
                    <SelectLabel>{group.heading}</SelectLabel>
                    {group.items.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <FieldError msg={f.errors.propertySubtype} />
          </div>
        </DashboardFormSection>

        <DashboardFormSection
          title="Location and price"
          description="Add the searchable location fields and customer-facing price."
        >
          <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="location">Location (display)</Label>
            <Input id="location" value={f.form.location} onChange={(e) => f.setField("location", e.target.value)} maxLength={160} />
            <FieldError msg={f.errors.location} />
          </div>
          <div>
            <Label htmlFor="city">City</Label>
            <Input id="city" value={f.form.city} onChange={(e) => f.setField("city", e.target.value)} maxLength={120} />
            <FieldError msg={f.errors.city} />
          </div>
          <div>
            <Label htmlFor="locality">Locality</Label>
            <Input id="locality" value={f.form.locality} onChange={(e) => f.setField("locality", e.target.value)} maxLength={120} />
            <FieldError msg={f.errors.locality} />
          </div>
          <div>
            <Label htmlFor="state">State</Label>
            <Input id="state" value={f.form.state} onChange={(e) => f.setField("state", e.target.value)} maxLength={120} />
            <FieldError msg={f.errors.state} />
          </div>
          <div>
            <Label htmlFor="pincode">Pincode</Label>
            <Input id="pincode" inputMode="numeric" value={f.form.pincode}
              onChange={(e) => f.setField("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))} />
            <FieldError msg={f.errors.pincode} />
          </div>
          <div>
            <Label htmlFor="price">{isRent ? "Monthly rent (₹)" : "Price (₹)"}</Label>
            <Input id="price" inputMode="numeric" placeholder={isRent ? "e.g. 25000" : "e.g. 5000000"} value={f.form.priceRupees}
              onChange={(e) => f.setField("priceRupees", e.target.value.replace(/[^\d.]/g, ""))} />
            <p className="mt-1 text-xs text-text-secondary">Enter the amount in rupees.</p>
            <FieldError msg={f.errors.priceRupees} />
          </div>
          {isRent ? (
            <>
              <div>
                <Label htmlFor="security-deposit">Security deposit (₹)</Label>
                <Input id="security-deposit" inputMode="numeric" placeholder="e.g. 150000"
                  value={f.form.securityDepositRupees}
                  onChange={(e) =>
                    f.setField("securityDepositRupees", e.target.value.replace(/[^\d.]/g, ""))
                  } />
                <FieldError msg={f.errors.securityDepositRupees} />
              </div>
              <div>
                <Label htmlFor="minimum-lease">Minimum lease (months)</Label>
                <Input id="minimum-lease" inputMode="numeric" placeholder="e.g. 11"
                  value={f.form.minimumLeaseMonths}
                  onChange={(e) =>
                    f.setField("minimumLeaseMonths", e.target.value.replace(/\D/g, "").slice(0, 3))
                  } />
                <FieldError msg={f.errors.minimumLeaseMonths} />
              </div>
              <div>
                <Label htmlFor="available-from">Available from</Label>
                <Input id="available-from" type="date" value={f.form.availableFrom}
                  onChange={(e) => f.setField("availableFrom", e.target.value)} />
                <p className="mt-1 text-xs text-text-secondary">Optional.</p>
                <FieldError msg={f.errors.availableFrom} />
              </div>
            </>
          ) : null}
          </div>
        </DashboardFormSection>

        <ListingLinksField
          links={f.form.listingLinks}
          errors={f.errors}
          onChange={(links) => f.setField("listingLinks", links)}
        />

        <PropertyDetailFields
          form={f.form}
          errors={f.errors}
          setField={f.setField}
          setDetailField={f.setDetailField}
        />

        <DashboardFormSection
          title="Amenities or facilities"
          description="Add concise, customer-visible features one at a time."
        >
          <Label htmlFor="amenity">Feature</Label>
          <div className="flex gap-2">
            <Input id="amenity" value={amenityDraft}
              onChange={(e) => setAmenityDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitAmenity(); } }}
              placeholder="Type and press Enter" />
            <Button type="button" variant="outline" onClick={commitAmenity}>Add</Button>
          </div>
          {f.form.amenities.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {f.form.amenities.map((a) => (
                <li key={a} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm">
                  {a}
                  <button type="button" aria-label={`Remove ${a}`} onClick={() => f.removeAmenity(a)} className={cn("h-5 w-5", CLOSE_BUTTON_CLASS)}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DashboardFormSection>

        <DashboardFormSection
          title="Media and review material"
          description="Public media is scanned and normalized; reviewer PDFs always remain private."
        >
          {f.editing ? (
            <div className="rounded-lg border border-border bg-card p-4 text-sm text-text-secondary">
              <p className="font-medium text-text-primary">Managed media retained</p>
              <p className="mt-1">
                {f.existingMedia.filter((asset) => asset.kind === "image").length} images
                {f.existingMedia.some((asset) => asset.kind === "panorama")
                  ? " · 1 panorama"
                  : ""}
                {f.existingMedia.some((asset) => asset.kind === "document")
                  ? ` · ${f.existingMedia.filter((asset) => asset.kind === "document").length} private documents`
                  : ""}
              </p>
              <p className="mt-2">Media replacement is kept separate from listing-fact edits.</p>
            </div>
          ) : (
          <>
          <div>
            <Label htmlFor="property-images">Property images</Label>
            <Input
              id="property-images"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              multiple
              disabled={f.submitting}
              onChange={(event) => {
                const selected = Array.from(event.target.files ?? []);
                f.setImages([...f.form.images, ...selected].slice(0, 10));
                event.target.value = "";
              }}
            />
            <p className="mt-1 text-xs text-text-secondary">
              Add 1–10 JPEG, PNG, or WebP images, up to 5 MiB each. The first image is the cover.
            </p>
            <FieldError msg={f.errors.images} />
            {imagePreviews.length > 0 && (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {imagePreviews.map(({ file, url }, index) => (
                  <li key={`${file.name}-${file.lastModified}-${index}`} className="rounded-lg border p-2">
                    <div className="relative aspect-video overflow-hidden rounded bg-muted">
                      <Image src={url} alt={`Selected property image ${index + 1}`} fill unoptimized className="object-cover" />
                    </div>
                    <p className="mt-2 truncate text-xs text-text-secondary">{file.name}</p>
                    <div className="mt-2 flex gap-1">
                      <Button type="button" variant="outline" size="icon" disabled={index === 0 || f.submitting} aria-label={`Move ${file.name} earlier`} onClick={() => moveImage(index, -1)}>
                        <ArrowUp className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button type="button" variant="outline" size="icon" disabled={index === imagePreviews.length - 1 || f.submitting} aria-label={`Move ${file.name} later`} onClick={() => moveImage(index, 1)}>
                        <ArrowDown className="h-4 w-4" aria-hidden />
                      </Button>
                      <button type="button" className={cn("h-9 w-9", CLOSE_BUTTON_CLASS)} disabled={f.submitting} aria-label={`Remove ${file.name}`} onClick={() => f.setImages(f.form.images.filter((_, itemIndex) => itemIndex !== index))}>
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <Label htmlFor="property-panorama">360 panorama (optional)</Label>
            <Input
              id="property-panorama"
              type="file"
              accept="image/jpeg,image/webp"
              disabled={f.submitting}
              onChange={(event) => {
                f.setPanorama(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
            <p className="mt-1 text-xs text-text-secondary">
              One 2:1 equirectangular JPEG or WebP, at least 2048 x 1024 and up to 5 MiB.
              It is scanned and normalized before review.
            </p>
            <FieldError msg={f.errors.panorama} />
            {f.form.panorama && panoramaPreview ? (
              <div className="mt-3 rounded-lg border p-2">
                <div className="relative aspect-[2/1] overflow-hidden rounded bg-muted">
                  <Image src={panoramaPreview} alt="Selected 360 panorama preview" fill unoptimized className="object-cover" />
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <Rotate3D className="h-4 w-4 text-text-secondary" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{f.form.panorama.name}</span>
                  <button
                    type="button"
                    className={cn("h-9 w-9", CLOSE_BUTTON_CLASS)}
                    disabled={f.submitting}
                    aria-label={`Remove ${f.form.panorama.name}`}
                    onClick={() => f.setPanorama(null)}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div>
            <Label htmlFor="property-documents">Reviewer documents (optional)</Label>
            <Input
              id="property-documents"
              type="file"
              accept="application/pdf"
              multiple
              disabled={f.submitting}
              onChange={(event) => {
                const selected = Array.from(event.target.files ?? []);
                f.setDocuments([...f.form.documents, ...selected].slice(0, 2));
                event.target.value = "";
              }}
            />
            <p className="mt-1 text-xs text-text-secondary">
              Up to 2 PDFs, 5 MiB each. These remain private and are never shown publicly.
            </p>
            <FieldError msg={f.errors.documents} />
            {f.form.documents.length > 0 && (
              <ul className="mt-2 space-y-2">
                {f.form.documents.map((file, index) => (
                  <li key={`${file.name}-${file.lastModified}`} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                    <FileText className="h-4 w-4 text-text-secondary" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <button type="button" className={cn("h-9 w-9", CLOSE_BUTTON_CLASS)} disabled={f.submitting} aria-label={`Remove ${file.name}`} onClick={() => f.setDocuments(f.form.documents.filter((_, itemIndex) => itemIndex !== index))}>
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          </>
          )}
          <div>
            <Label htmlFor="meta">Short note</Label>
            <Textarea id="meta" value={f.form.meta} onChange={(e) => f.setField("meta", e.target.value)} maxLength={120} />
          </div>
        </DashboardFormSection>

        <Button type="submit" disabled={f.submitting} className="w-full sm:w-auto">
          {f.submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {f.uploadProgress ??
            (f.adminCorrection
              ? "Stage correction"
              : f.editing
                ? "Save changes"
                : "Submit for review")}
        </Button>
      </form>
    </DashboardFormPage>
  );
}
