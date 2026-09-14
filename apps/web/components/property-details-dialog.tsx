"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DESCRIPTION_LABELS, rows, type Details } from "@/lib/property-details";

export function PropertyDetailsSummary({
  details,
  omitDescription = false,
}: {
  details: Details;
  /** Drop the About the project/property row: the detail page renders that
   * narrative in its own Description section (see property-description.tsx)
   * so it is not printed twice. The card-triggered PropertyDetailsDialog
   * keeps the default and still shows it inline. */
  omitDescription?: boolean;
}) {
  if (!details) return <p className="text-sm text-text-secondary">No subtype-specific details are available for this legacy listing.</p>;
  const items = rows(details)
    .filter((item) => item.value !== null && item.value !== undefined && item.value !== "")
    .filter((item) => !omitDescription || !DESCRIPTION_LABELS.has(item.label));
  return (
    <dl className="grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className={String(item.value).length > 90 ? "sm:col-span-2" : undefined}>
          <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">{item.label}</dt>
          <dd className="mt-1 break-words whitespace-pre-wrap text-text-primary">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PropertyDetailsDialog({ title, details }: { title: string; details: Details }) {
  if (!details) return null;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="w-full">View property details</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] !max-w-3xl overflow-y-auto rounded-2xl">
        <DialogHeader className="border-b border-border pb-5 pr-8 text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Property specifications and project information supplied with this listing.</DialogDescription>
        </DialogHeader>
        <PropertyDetailsSummary details={details} />
      </DialogContent>
    </Dialog>
  );
}
