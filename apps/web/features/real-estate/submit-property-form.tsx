"use client";

import * as React from "react";
import { Loader2, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORY_OPTIONS,
  FURNISHING_OPTIONS,
  CONSTRUCTION_OPTIONS,
} from "@/lib/property-submit";
import { useSubmitProperty } from "./use-submit-property";

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-sm text-destructive">{msg}</p>;
}

export function SubmitPropertyForm() {
  const f = useSubmitProperty();
  const [amenityDraft, setAmenityDraft] = React.useState("");

  const commitAmenity = () => {
    f.addAmenity(amenityDraft);
    setAmenityDraft("");
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Submit a property</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Your listing goes to the review team. You can track its status under My submissions.
        </p>
      </div>

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void f.submit();
        }}
      >
        {/* Basics */}
        <section className="space-y-4">
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
            <Label htmlFor="category">Category</Label>
            <Select value={f.form.category} onValueChange={(v) => f.setField("category", v as typeof f.form.category)}>
              <SelectTrigger id="category"><SelectValue placeholder="Choose a category" /></SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError msg={f.errors.category} />
          </div>
        </section>

        {/* Location & price */}
        <section className="grid gap-4 sm:grid-cols-2">
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
        <section className="grid gap-4 sm:grid-cols-3">
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
        <section>
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
        <section>
          <div className="flex items-center justify-between">
            <Label>Extra details</Label>
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

        {/* Image + meta */}
        <section className="space-y-4">
          <div>
            <Label htmlFor="image">Image URL</Label>
            <Input id="image" placeholder="https://…" value={f.form.image} onChange={(e) => f.setField("image", e.target.value)} maxLength={200} />
          </div>
          <div>
            <Label htmlFor="meta">Short note</Label>
            <Textarea id="meta" value={f.form.meta} onChange={(e) => f.setField("meta", e.target.value)} maxLength={120} />
          </div>
        </section>

        <Button type="submit" disabled={f.submitting} className="w-full sm:w-auto">
          {f.submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit for review
        </Button>
      </form>
    </div>
  );
}
