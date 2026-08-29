"use client";

import * as React from "react";

import {
  DESKTOP_VIEWPORT_WIDTH,
  ViewportFrame,
} from "@/features/dashboard/viewport-frame";

/**
 * Full-width live preview for a campaign being authored or reviewed.
 *
 * A preview squeezed into a 20rem aside cannot show a 1440px page at a useful
 * size, so both the banner wizard and the offer form put this above the fields
 * at the full width of the workspace instead.
 *
 * Desktop only. The phone preview that used to sit beside it has been
 * withdrawn, and with one width left there is nothing to switch between.
 */
export function CampaignPreviewPanel({
  caption,
  title = "Live preview",
  children,
}: {
  caption: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={`${title} — ${caption}`}
      className="space-y-3 rounded-xl border border-border bg-muted/20 p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <p className="mt-0.5 text-xs text-text-secondary">{caption}</p>
        </div>
        <p className="text-xs font-medium text-text-primary">
          Desktop · {DESKTOP_VIEWPORT_WIDTH}px
        </p>
      </div>
      <div className="rounded-xl bg-white p-3">
        <ViewportFrame>{children}</ViewportFrame>
      </div>
      <p className="text-xs text-text-secondary">
        Preview only. Approval, targeting, schedule, and ranking decide actual visibility.
      </p>
    </section>
  );
}
