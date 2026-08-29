"use client";

import * as React from "react";
import { Monitor, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  VIEWPORT_WIDTHS,
  ViewportFrame,
  type ViewportName,
  viewportLabel,
} from "@/features/dashboard/viewport-frame";

/**
 * Full-width live preview for a campaign being authored or reviewed.
 *
 * A preview squeezed into a 20rem aside cannot show a 1440px page at a useful
 * size, so both the banner wizard and the offer form put this above the fields
 * at the full width of the workspace instead.
 */
export function CampaignPreviewPanel({
  device,
  onDeviceChange,
  caption,
  title = "Live preview",
  children,
}: {
  device: ViewportName;
  onDeviceChange: (device: ViewportName) => void;
  caption: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={`${title} — ${caption}`}
      className="space-y-3 rounded-xl border border-border bg-muted/20 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <p className="mt-0.5 text-xs text-text-secondary">{caption}</p>
        </div>
        <div
          className="flex rounded-lg border border-border bg-card p-0.5"
          role="group"
          aria-label="Preview size"
        >
          {(
            [
              ["desktop", Monitor],
              ["mobile", Smartphone],
            ] as const
          ).map(([value, Icon]) => (
            <Button
              key={value}
              type="button"
              size="icon"
              variant={device === value ? "outline" : "ghost"}
              onClick={() => onDeviceChange(value)}
              aria-pressed={device === value}
              aria-label={`${viewportLabel(value)} preview`}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </Button>
          ))}
        </div>
      </div>
      <div className="rounded-xl bg-white p-3">
        <ViewportFrame viewport={device}>{children}</ViewportFrame>
      </div>
      <p className="text-xs text-text-secondary">
        <span className="font-medium text-text-primary">
          {viewportLabel(device)} · {VIEWPORT_WIDTHS[device]}px
        </span>{" "}
        · Preview only. Approval, targeting, schedule, and ranking decide actual visibility.
      </p>
    </section>
  );
}
