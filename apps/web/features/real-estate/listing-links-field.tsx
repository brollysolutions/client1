"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";

import { DashboardFormSection } from "@/features/dashboard/dashboard-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LISTING_LINK_HOST_HINT,
  LISTING_LINK_PLATFORM_LABELS,
  MAX_LISTING_LINKS,
  resolveListingLinkPlatform,
} from "@/lib/listing-links";

/**
 * Repeatable external-link rows for the submit/edit property form.
 *
 * The resolved platform is shown back to the author as they type. That is the
 * point of the live resolve: the author sees "YouTube" appear only when the URL
 * genuinely points at YouTube, so a mistyped or pasted-wrong host is obvious
 * here rather than after an Admin rejection. The server re-derives and
 * re-checks regardless; nothing here is a security boundary.
 */
export function ListingLinksField({
  links,
  errors,
  onChange,
}: {
  links: string[];
  errors: Record<string, string>;
  onChange: (links: string[]) => void;
}) {
  const rows = links.length > 0 ? links : [""];

  const setRow = (index: number, value: string) => {
    const next = [...rows];
    next[index] = value;
    onChange(next);
  };

  const addRow = () => onChange([...rows, ""]);

  const removeRow = (index: number) => {
    const next = rows.filter((_, position) => position !== index);
    onChange(next);
  };

  return (
    <DashboardFormSection
      title="Links to this property elsewhere"
      description={`Optional. Add up to ${MAX_LISTING_LINKS} links to ${LISTING_LINK_HOST_HINT}. Buyers see these on the listing page.`}
    >
      <div className="space-y-3">
        {rows.map((url, index) => {
          const platform = resolveListingLinkPlatform(url);
          const error = errors[`listingLink-${index}`];
          return (
            <div key={index}>
              <Label htmlFor={`listing-link-${index}`} className="sr-only">
                Listing link {index + 1}
              </Label>
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <Input
                    id={`listing-link-${index}`}
                    type="url"
                    inputMode="url"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={url}
                    maxLength={1000}
                    onChange={(event) => setRow(index, event.target.value)}
                  />
                  {platform ? (
                    <p className="mt-1 text-xs text-text-secondary">
                      Recognised as {LISTING_LINK_PLATFORM_LABELS[platform]}.
                    </p>
                  ) : null}
                  {error ? (
                    <p className="mt-1 text-xs text-destructive" role="alert">
                      {error}
                    </p>
                  ) : null}
                </div>
                {rows.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(index)}
                    aria-label={`Remove listing link ${index + 1}`}
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {errors.listingLinks ? (
        <p className="text-xs text-destructive" role="alert">
          {errors.listingLinks}
        </p>
      ) : null}
      {rows.length < MAX_LISTING_LINKS ? (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus aria-hidden className="size-4" />
            Add another link
          </Button>
        </div>
      ) : null}
    </DashboardFormSection>
  );
}
