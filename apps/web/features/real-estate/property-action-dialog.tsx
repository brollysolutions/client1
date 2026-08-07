"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useMe } from "@/features/dashboard/me-provider";
import { createEnquiry } from "@/lib/enquiries";
import { isValidMobile, normalizeMobile, toE164 } from "@/lib/phone";
import type { REListing } from "@/lib/real-estate";
import { createSiteVisit, type SiteVisitTimeSlot } from "@/lib/site-visits";

const TIME_SLOTS: { value: SiteVisitTimeSlot; label: string }[] = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type Errors = {
  name?: string;
  phone?: string;
  preferredDate?: string;
  preferredSlot?: string;
  pickupLocation?: string;
  pickupAt?: string;
};

// Floating confirmation dialog behind the "Enquire" and "Book a site visit"
// actions on a dashboard property card. Enquire submits to the public leads
// endpoint (no auth requirement, but works fine from inside the dashboard);
// site-visit submits to the real, RLS-scoped site-visits API. Name/phone
// prefill from the logged-in client's profile via useMe(), editable in place.
export function PropertyActionDialog({
  variant,
  listing,
  trigger,
}: {
  variant: "enquire" | "site-visit";
  listing: REListing;
  trigger: React.ReactNode;
}) {
  const { me } = useMe();
  const isSiteVisit = variant === "site-visit";

  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [preferredDate, setPreferredDate] = React.useState("");
  const [preferredSlot, setPreferredSlot] = React.useState<SiteVisitTimeSlot | "">("");
  const [pickupRequested, setPickupRequested] = React.useState(false);
  const [pickupLocation, setPickupLocation] = React.useState("");
  const [pickupAt, setPickupAt] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<Errors>({});

  function reset() {
    setMessage("");
    setPreferredDate("");
    setPreferredSlot("");
    setPickupRequested(false);
    setPickupLocation("");
    setPickupAt("");
    setErrors({});
    setSubmitting(false);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Re-seed from the logged-in profile every time the dialog opens, so a
      // fresh open always reflects the current profile (still editable below).
      setName(me ? `${me.firstName} ${me.lastName}`.trim() : "");
      setPhone(me ? normalizeMobile(me.mobile) : "");
    } else {
      reset();
    }
  }

  function validate(): boolean {
    const next: Errors = {};
    if (!name.trim()) next.name = "Please enter your name.";
    if (!isValidMobile(phone)) next.phone = "Enter a valid 10-digit mobile number.";
    if (isSiteVisit) {
      if (!preferredDate) next.preferredDate = "Please pick a preferred date.";
      else if (preferredDate < todayIso()) next.preferredDate = "Date can't be in the past.";
      if (!preferredSlot) next.preferredSlot = "Please pick a time slot.";
      if (pickupRequested) {
        if (!pickupLocation.trim()) next.pickupLocation = "Please enter the pickup location.";
        if (!pickupAt) next.pickupAt = "Please choose the pickup time.";
        else if (new Date(pickupAt).getTime() <= Date.now()) {
          next.pickupAt = "Pickup time must be in the future.";
        }
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    setSubmitting(true);

    if (isSiteVisit) {
      const result = await createSiteVisit({
        propertyRef: listing.id,
        title: listing.title,
        locality: listing.locality,
        city: listing.city,
        contactName: name.trim(),
        contactMobile: toE164(phone),
        preferredDate,
        preferredTimeSlot: preferredSlot as SiteVisitTimeSlot,
        ...(message.trim() ? { message: message.trim() } : {}),
        ...(pickupRequested
          ? {
              pickupRequested: true,
              pickupLocation: pickupLocation.trim(),
              pickupAt: new Date(pickupAt).toISOString(),
            }
          : {}),
      });
      if (result.ok) {
        setOpen(false);
        reset();
        toast.success("Site visit requested", {
          description: "We'll confirm a time with you soon.",
        });
      } else {
        setSubmitting(false);
        toast.error(result.error || "Couldn't book the site visit. Please try again.");
      }
      return;
    }

    const result = await createEnquiry({
      propertyRef: listing.id,
      title: listing.title,
      locality: listing.locality,
      city: listing.city,
      contactName: name.trim(),
      contactMobile: toE164(phone),
      ...(message.trim() ? { message: message.trim() } : {}),
    });
    if (result.ok) {
      setOpen(false);
      reset();
      toast.success("Enquiry sent", { description: "Your agent will get back to you shortly." });
    } else {
      setSubmitting(false);
      toast.error(result.error || "Couldn't send your enquiry. Please try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading">
            {isSiteVisit ? "Book a site visit" : "Enquire about this property"}
          </DialogTitle>
          <DialogDescription>
            {isSiteVisit
              ? `Tell us when you'd like to visit ${listing.title} in ${listing.locality}, ${listing.city}.`
              : `Leave your details and our team will get back to you about ${listing.title}.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="pad-name">Name</Label>
            <Input
              id="pad-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "pad-name-error" : undefined}
              disabled={submitting}
            />
            {errors.name && (
              <p id="pad-name-error" className="text-sm text-destructive">
                {errors.name}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="pad-phone">Mobile number</Label>
            <Input
              id="pad-phone"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
              placeholder="98765 43210"
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? "pad-phone-error" : undefined}
              disabled={submitting}
            />
            {errors.phone && (
              <p id="pad-phone-error" className="text-sm text-destructive">
                {errors.phone}
              </p>
            )}
          </div>

          {isSiteVisit ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="pad-date">Preferred date</Label>
                <Input
                  id="pad-date"
                  type="date"
                  min={todayIso()}
                  value={preferredDate}
                  onChange={(event) => setPreferredDate(event.target.value)}
                  aria-invalid={!!errors.preferredDate}
                  aria-describedby={errors.preferredDate ? "pad-date-error" : undefined}
                  disabled={submitting}
                />
                {errors.preferredDate && (
                  <p id="pad-date-error" className="text-sm text-destructive">
                    {errors.preferredDate}
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label id="pad-slot-label">Preferred time</Label>
                <ToggleGroup
                  type="single"
                  value={preferredSlot}
                  onValueChange={(value) => setPreferredSlot((value as SiteVisitTimeSlot) || "")}
                  aria-labelledby="pad-slot-label"
                  disabled={submitting}
                >
                  {TIME_SLOTS.map((slot) => (
                    <ToggleGroupItem key={slot.value} value={slot.value}>
                      {slot.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                {errors.preferredSlot && (
                  <p className="text-sm text-destructive">{errors.preferredSlot}</p>
                )}
              </div>

              <div className="rounded-xl border border-border p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="pad-pickup"
                    checked={pickupRequested}
                    onCheckedChange={(checked) => setPickupRequested(checked === true)}
                    disabled={submitting}
                  />
                  <div>
                    <Label htmlFor="pad-pickup">I need pickup for this visit</Label>
                    <p className="text-xs text-text-secondary">
                      Our team will arrange a vehicle and share the driver details.
                    </p>
                  </div>
                </div>
                {pickupRequested ? (
                  <div className="mt-4 grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="pad-pickup-location">Pickup location</Label>
                      <Textarea
                        id="pad-pickup-location"
                        value={pickupLocation}
                        onChange={(event) => setPickupLocation(event.target.value)}
                        aria-invalid={!!errors.pickupLocation}
                        disabled={submitting}
                        rows={2}
                      />
                      {errors.pickupLocation ? (
                        <p className="text-sm text-destructive">{errors.pickupLocation}</p>
                      ) : null}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="pad-pickup-at">Preferred pickup time</Label>
                      <Input
                        id="pad-pickup-at"
                        type="datetime-local"
                        value={pickupAt}
                        onChange={(event) => setPickupAt(event.target.value)}
                        aria-invalid={!!errors.pickupAt}
                        disabled={submitting}
                      />
                      {errors.pickupAt ? (
                        <p className="text-sm text-destructive">{errors.pickupAt}</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="pad-message">Message (optional)</Label>
            <Textarea
              id="pad-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              disabled={submitting}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : isSiteVisit ? "Request visit" : "Send enquiry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
