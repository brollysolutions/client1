"use client";

import * as React from "react";
import Image from "next/image";
import { ArrowDown, ArrowUp, FileText, Loader2, Plus, Video, X } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { DashboardFormPage } from "@/features/dashboard/dashboard-ui";
import { CONSTRUCTION_OPTIONS, FURNISHING_OPTIONS } from "@/lib/property-submit";
import { PROPERTY_SUBTYPE_GROUPS } from "@/lib/property-taxonomy";
import { useSubmitProperty } from "./use-submit-property";

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-sm text-destructive">{msg}</p>;
}

export function SubmitPropertyForm() {
  const f = useSubmitProperty();
  const [amenityDraft, setAmenityDraft] = React.useState("");
  const imagePreviews = React.useMemo(
    () => f.form.images.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [f.form.images],
  );
  const videoPreview = React.useMemo(
    () => (f.form.video ? URL.createObjectURL(f.form.video) : null),
    [f.form.video],
  );

  React.useEffect(
    () => () => {
      imagePreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    },
    [imagePreviews],
  );
  React.useEffect(
    () => () => {
      if (videoPreview) URL.revokeObjectURL(videoPreview);
    },
    [videoPreview],
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
      eyebrow="Property listings"
      title="Submit a property"
      description="Capture listing details, managed media, and private reviewer documents for Admin review."
      backHref="/dashboard/my-submissions"
      backLabel="Back to submissions"
      formTitle="Listing submission"
      formDescription="Nothing becomes public until the review team approves the submission."
    >
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void f.submit();
        }}
      >
        {/* Basics */}
        <section className="space-y-4 rounded-xl border border-border bg-muted/20 p-4 sm:p-5">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Listing basics</h2>
            <p className="mt-0.5 text-xs text-text-secondary">
              Provide the public title, property type, and catalogue category.
            </p>
          </div>
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={f.form.title} onChange={(e) => f.setField("title", e.target.value)} maxLength={200} />
            <FieldError msg={f.errors.title} />
          </div>
          <div>
            <Label htmlFor="type">Type</Label>
            <Input id="type" placeholder="e.g. 2BHK Apartment" value={f.form.type} onChange={(e) => f.setField("type", e.target.value)} maxLength={40} />
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
        </section>

        {/* Location & price */}
        <section className="grid gap-4 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2 sm:p-5">
          <div className="sm:col-span-2">
            <h2 className="text-sm font-semibold text-text-primary">Location and price</h2>
            <p className="mt-0.5 text-xs text-text-secondary">
              Add the searchable location fields and customer-facing price.
            </p>
          </div>
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
            <Label htmlFor="pincode">Pincode</Label>
            <Input id="pincode" inputMode="numeric" value={f.form.pincode}
              onChange={(e) => f.setField("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))} />
            <FieldError msg={f.errors.pincode} />
          </div>
          <div>
            <Label htmlFor="price">Price (₹)</Label>
            <Input id="price" inputMode="numeric" placeholder="e.g. 5000000" value={f.form.priceRupees}
              onChange={(e) => f.setField("priceRupees", e.target.value.replace(/[^\d.]/g, ""))} />
            <p className="mt-1 text-xs text-text-secondary">Enter the amount in rupees.</p>
            <FieldError msg={f.errors.priceRupees} />
          </div>
        </section>

        {/* Specs */}
        <section className="grid gap-4 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-3 sm:p-5">
          <div className="sm:col-span-3">
            <h2 className="text-sm font-semibold text-text-primary">Property specifications</h2>
            <p className="mt-0.5 text-xs text-text-secondary">
              Record the key facts used for filtering and compliance review.
            </p>
          </div>
          <div>
            <Label htmlFor="bhk">BHK</Label>
            <Input id="bhk" inputMode="numeric" value={f.form.bhk} onChange={(e) => f.setField("bhk", e.target.value.replace(/\D/g, ""))} />
          </div>
          <div>
            <Label htmlFor="area">Area (sqft)</Label>
            <Input id="area" inputMode="numeric" value={f.form.area_sqft} onChange={(e) => f.setField("area_sqft", e.target.value.replace(/\D/g, ""))} />
          </div>
          <div>
            <Label htmlFor="age">Age (years)</Label>
            <Input id="age" inputMode="numeric" value={f.form.age_years} onChange={(e) => f.setField("age_years", e.target.value.replace(/\D/g, ""))} />
          </div>
          <div>
            <Label htmlFor="furnishing">Furnishing</Label>
            <Select value={f.form.furnishing} onValueChange={(v) => f.setField("furnishing", v as typeof f.form.furnishing)}>
              <SelectTrigger id="furnishing"><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>
                {FURNISHING_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
              </SelectContent>
            </Select>
            <FieldError msg={f.errors.furnishing} />
          </div>
          <div>
            <Label htmlFor="construction">Construction status</Label>
            <Select value={f.form.constructionStatus} onValueChange={(v) => f.setField("constructionStatus", v as typeof f.form.constructionStatus)}>
              <SelectTrigger id="construction"><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>
                {CONSTRUCTION_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
              </SelectContent>
            </Select>
            <FieldError msg={f.errors.constructionStatus} />
          </div>
          <div>
            <Label htmlFor="rera">RERA number</Label>
            <Input id="rera" value={f.form.rera_number} onChange={(e) => f.setField("rera_number", e.target.value)} maxLength={40} />
            <FieldError msg={f.errors.rera_number} />
          </div>
        </section>

        {/* Amenities */}
        <section className="space-y-4 rounded-xl border border-border bg-muted/20 p-4 sm:p-5">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Amenities</h2>
            <p className="mt-0.5 text-xs text-text-secondary">
              Add concise, customer-visible property features.
            </p>
          </div>
          <Label htmlFor="amenity">Amenities</Label>
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
                  <button type="button" aria-label={`Remove ${a}`} onClick={() => f.removeAmenity(a)}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Extra details (JSONB key/value) */}
        <section className="space-y-4 rounded-xl border border-border bg-muted/20 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Extra details</h2>
              <p className="mt-0.5 text-xs text-text-secondary">
                Optional structured facts that do not fit the standard fields.
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={f.addDetailRow}>
              <Plus className="mr-1 h-4 w-4" /> Add row
            </Button>
          </div>
          <div className="space-y-2">
            {f.form.details.map((row, i) => (
              <div key={i} className="flex gap-2">
                <Input placeholder="Key" value={row.key} onChange={(e) => f.setDetailRow(i, { ...row, key: e.target.value })} />
                <Input placeholder="Value" value={row.value} onChange={(e) => f.setDetailRow(i, { ...row, value: e.target.value })} />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove row" onClick={() => f.removeDetailRow(i)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </section>

        {/* Managed media + meta */}
        <section className="space-y-4 rounded-xl border border-border bg-muted/20 p-4 sm:p-5">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Media and review material</h2>
            <p className="mt-0.5 text-xs text-text-secondary">
              Public media is scanned and normalized; reviewer PDFs always remain private.
            </p>
          </div>
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
                      <Button type="button" variant="ghost" size="icon" disabled={f.submitting} aria-label={`Remove ${file.name}`} onClick={() => f.setImages(f.form.images.filter((_, itemIndex) => itemIndex !== index))}>
                        <X className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <Label htmlFor="property-video">Property video (optional)</Label>
            <Input
              id="property-video"
              type="file"
              accept="video/mp4"
              disabled={f.submitting}
              onChange={(event) => {
                f.setVideo(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
            <p className="mt-1 text-xs text-text-secondary">
              One MP4, up to 20 MiB and 2 minutes. It is scanned and normalized before review.
            </p>
            <FieldError msg={f.errors.video} />
            {f.form.video && videoPreview ? (
              <div className="mt-3 rounded-lg border p-2">
                <video
                  src={videoPreview}
                  controls
                  preload="metadata"
                  className="aspect-video w-full rounded bg-black object-contain"
                  aria-label="Selected property video preview"
                />
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <Video className="h-4 w-4 text-text-secondary" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{f.form.video.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={f.submitting}
                    aria-label={`Remove ${f.form.video.name}`}
                    onClick={() => f.setVideo(null)}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
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
                    <Button type="button" variant="ghost" size="icon" disabled={f.submitting} aria-label={`Remove ${file.name}`} onClick={() => f.setDocuments(f.form.documents.filter((_, itemIndex) => itemIndex !== index))}>
                      <X className="h-4 w-4" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <Label htmlFor="meta">Short note</Label>
            <Textarea id="meta" value={f.form.meta} onChange={(e) => f.setField("meta", e.target.value)} maxLength={120} />
          </div>
        </section>

        <Button type="submit" disabled={f.submitting} className="w-full sm:w-auto">
          {f.submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {f.uploadProgress ?? "Submit for review"}
        </Button>
      </form>
    </DashboardFormPage>
  );
}
